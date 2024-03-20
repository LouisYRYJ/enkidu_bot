
import * as fs from 'fs/promises';
import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';

import { cleanArxivJsonData } from "./extract.js";
import test from 'node:test';
import { MessageEntity } from 'grammy/types';

// Needed for startsWithKeyword
type KeywordMatchResult = {
    found: boolean;
    keyword?: string;
    remainingText?: string;
};

type SearchQuery = {
    title: string[];
    author: string[];
    summary: string[];
    publication_date: string[];
};

type ResponseWithFormatting = {
    response_string: string;
    entities: MessageEntity[];
}


const SearchQueryID = new Map<string, string>(
    [["title", "ti:"],
    ["author", "au:"],
    ["summary", "abs:"]]
);

function dateToString(date: Date) {
    let yearString = date.getFullYear();
    let monthString = (date.getMonth() + 1 < 10 ? '0' : '') + (date.getMonth() + 1).toString();
    let dayString = (date.getDate() < 10 ? '0' : '') + date.getDate().toString();

    return yearString + monthString + dayString;
}


// Checks for the defining keywords in SearchQuery (right now this is hard coded below and should be fixed)
export function startsWithKeyword(text: string, keywords: string[]): KeywordMatchResult {
    // Trim leading and trailing whitespaces and convert text to lower case
    text = text.trim().toLowerCase();


    // Find a keyword that matches at the start of the string
    for (const keyword of keywords) {
        if (text.startsWith(keyword)) {
            //Returns the correct keyword and the rest of the query after cutting out 'keyword:'
            const originalKeyword = text.substring(0, keyword.length);
            const remainingText = text.slice(keyword.length).trim();
            if (remainingText[0] !== ":") {
                return { found: false };
            }
            return {
                found: true,
                keyword: originalKeyword,
                remainingText: remainingText.slice(1)
            };

        }
    }

    // If no match is found
    return { found: false };
}



export function update_query(keyword: string, keyword_queries: string, current_query: SearchQuery, remove_query: boolean): SearchQuery {
    let pieces = keyword_queries.split(",");
    pieces = pieces.map(str => str.trim());

    //For the "summary: +" syntax
    let add_summary = false;

    //Bot uses "date" not "publication_date" which is the corresponding key in SearchQuery
    if (keyword === "date") {
        keyword = "publication_date";
    }

    if (remove_query) {
        if (keyword === "summary" && pieces.includes("+")) {
            let placeholder: string[] = []

            current_query["summary"].forEach((item, index) => {
                if (!(current_query["title"].includes(item))) {
                    placeholder.push(item);
                }
            })

            current_query["summary"] = placeholder
            return current_query;
        }
        let placeholder: string[] = [];
        current_query[keyword as keyof SearchQuery].forEach((item, index) => {
            if (!(pieces.includes(item))) {
                placeholder.push(item);
            }
        })
        current_query[keyword as keyof SearchQuery] = placeholder
        return current_query;
    }

    //returns keyword: item1,item2,... as [item1, item2]...
    pieces.forEach(piece => {
        if (piece.trim() === "") {
            return
        }
        if (keyword === "summary" && piece === "+") {
            add_summary = true;
            return;
        }
        current_query[keyword as keyof SearchQuery].push(piece);
    });

    if (add_summary) {
        current_query["summary"] = current_query["summary"].concat(current_query["title"]);
    }

    //Remove duplicates
    current_query[keyword as keyof SearchQuery] = current_query[keyword as keyof SearchQuery].filter(function (item, pos, self) {
        return self.indexOf(item) == pos;
    })

    return current_query
}


function extractDate(inputString: string): Date | null {

    const dateRegex = /^(?:(\d{1,2})\.(\d{1,2})\.)?(\d{4})$/;

    // Attempt to match the input with the regex pattern
    const matches = inputString.match(dateRegex)

    if (!matches) {
        return null;
    }
    const day = matches[1] ? parseInt(matches[1], 10) : 1; // Default to first day of the month/year if not specified
    const month = matches[2] ? parseInt(matches[2], 10) - 1 : 0; // Months are zero-indexed in JS (0-11)
    const year = parseInt(matches[3], 10);
    // Create and return new Date object with parsed values 
    return new Date(year, month, day);
}



function query_to_search_string(query: SearchQuery): string {

    var apiUrl = `https://export.arxiv.org/api/query?search_query=`;

    var start_date = new Date("1988");
    var final_date = new Date();

    // Date syntax e.g. submittedDate:[19880101+TO+2024]
    for (const entry of query["publication_date"]) {

        if (entry.toLowerCase().startsWith("from")) {
            let potential_date: Date | null = extractDate(entry.slice(4).trim());
            if (potential_date) {
                start_date = potential_date;
            }
        }

        if (entry.toLowerCase().startsWith("until")) {
            let potential_date: Date | null = extractDate(entry.slice(5).trim());
            if (potential_date) {
                final_date = potential_date;
            }
        }
    };
    const date_string = "submittedDate:[" + dateToString(start_date) + "+TO+" + dateToString(final_date) + "]";
    apiUrl += date_string;

    // Handle rest of syntax +AND+key:item
    for (let [key, abbreviation] of SearchQueryID) {
        for (var value of query[key as keyof SearchQuery]) {
            var current_query_item = "+"
            if (value.startsWith("-")) {
                value = value.slice(1);
                current_query_item += "ANDNOT+"
            }
            else {
                current_query_item += "AND+"
            }
            value = value.replace(" ", "_");
            current_query_item += abbreviation + value
            apiUrl += current_query_item
        }
    }
    // max_results hard coded right now, should give option to view more
    apiUrl += "&max_results=10"
    return apiUrl

}

// Use the correct apiURL from query_to_search_string to make a request to arxiv api, still need to check this
export async function arxiv_search_results(query: SearchQuery): Promise<Object[]> {

    const apiURL = query_to_search_string(query);
    //console.log(apiURL);
    try {
        const response = await fetch(apiURL);


        // Ensure there's no server-side error before parsing.
        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }

        const xmlData: string = await response.text();

        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "", // To remove attribute prefix '@' if needed.
            allowBooleanAttributes: true,
        });
        var jsonObj = parser.parse(xmlData);

        if (jsonObj.feed["opensearch:totalResults"]["#text"] === 0) {
            return [{ title: "No results!", id: null }]
        }

        if (jsonObj.feed["opensearch:totalResults"]["#text"] === 1) {
            return [jsonObj.feed.entry]
        }

        // await fs.writeFile("./arxiv_search_result.json", JSON.stringify(jsonObj, null, 2));


        return jsonObj.feed.entry;

    } catch (error) {
        console.error("There was an error fetching the arXiv metadata:", error);
        throw error;
    }
}


export function arxiv_search_results_as_string(answers: any): ResponseWithFormatting {

    let i = 1;
    let response: ResponseWithFormatting = { response_string: "", entities: [] };
    let current_offset = 0;

    for (const key in answers) {

        if (answers[key].id === null) {
            response = { response_string: answers[key].title, entities: [] };
            return response
        }
        // replace new line with whitespace
        let paper_title: string = answers[key].title.replace(/\r?\n|\r/g, "");
        //console.log(paper_title)
        let paper_link: string = answers[key].id;

        response.response_string += `${i}. ${paper_title} \n`;

        let current_entity: MessageEntity = {
            type: "text_link",
            offset: current_offset + `${i}. `.length,
            length: paper_title.length,
            url: paper_link,
        };
        i += 1;
        current_offset = response.response_string.length;
        response.entities.push(current_entity);
    }
    return response
}




//small test, should move this or delete it





async function test_function() {
    var current_query: SearchQuery =
    {
        title: ["adfadfsdf"],
        author: [],
        summary: [],
        publication_date: ["from 2024"]
    };



    // let answers = await arxiv_search_results(current_query);
    //  arxiv_search_results_as_string(answers);
}

//test_function()