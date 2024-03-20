
import * as fs from 'fs/promises';
import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';

const baseJsonPath: string = './arxiv_papers.json'; // path to your base JSON file


// Regular expression to extract arXiv ID (global flag to find all matches)
const arxivLinkPattern: RegExp = /arxiv\.org\/.*?\/(\d+\.\d+)(v\d+)?/ig;




// Function to extract unique arXiv ids from text using regex
export function getArxivIds(text: string): string[] {
    const idSet: Set<string> = new Set();
    let match;

    // Uses Set to avoid duplicates
    while ((match = arxivLinkPattern.exec(text)) !== null) {
        if (match[1]) {
            idSet.add(match[1]);
        }
    }

    return Array.from(idSet);
}



// Function to fetch metadata from arXiv API and return as JSON.
// Throws an error if fetching or parsing fails.
export async function fetchArxivMetadata(arxivId: string, dateObject: Date): Promise<any> {
    const apiUrl: string = `http://export.arxiv.org/api/query?id_list=${arxivId}`;

    try {
        const response = await fetch(apiUrl);

        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }

        // Arxiv api response is in XML, needs to converted to JSON
        const xmlData: string = await response.text();
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "",
            allowBooleanAttributes: true,
        });


        var jsonObj = parser.parse(xmlData);
        jsonObj["date"] = dateObject;
        return jsonObj;

    } catch (error) {
        console.error("There was an error fetching the arXiv metadata:", error);
        throw error;
    }
}

// All the relevant metadata that will be saved to the JSON
type ArxivEntry = {
    id: string;
    title: string;
    summary: string;
    authors: string[];
    publication_date: string;
    received_message_date: Date;
};


//Only need this for cleanArxivJsonData
type Author = {
    name: string;
};


// Function to extract the needed data from the parsed arXiv JSON response, return a JSON structure
export function cleanArxivJsonData(jsonData: any): Object | null {
    if (!jsonData.feed || typeof jsonData.feed !== 'object') {
        console.error("Invalid JSON structure. The 'feed' key is missing or not an object.");
        return null;
    }

    const authorNames: string[] = [];
    if (Array.isArray(jsonData.feed.entry.author)) {
        jsonData.feed.entry.author.forEach((auth: Author) => {
            if (auth && auth.name) {
                authorNames.push(auth.name);
            }
        });
    } else {
        console.error("Invalid JSON structure. The 'authors' key is missing or not an array.");
        return null;
    }

    const entry = {
        id: jsonData.feed.entry.id,
        title: jsonData.feed.entry.title,
        summary: jsonData.feed.entry.summary,
        authors: authorNames,
        publication_date: jsonData.feed.entry.published,
        received_message_date: jsonData.date,
    };

    return entry;
}


//Save the data in arxiv_papers.json
export async function appendMetadataToFile(metadata: any): Promise<void> {
    try {
        let baseJson: any;
        try {
            const baseFileContent: string = await fs.readFile(baseJsonPath, { encoding: 'utf8' });
            baseJson = JSON.parse(baseFileContent);
        } catch (error) {
            console.log('Base json not found or invalid.', error)
            baseJson = {};
        }

        // This will be the key, the unique identifier (this also includes the version)
        const arxivId: string = metadata.feed.entry.id.split('/').pop();
        baseJson[arxivId] = cleanArxivJsonData(metadata);

        await fs.writeFile(baseJsonPath, JSON.stringify(baseJson, null, 2)); // Writing with indentation for readability

    } catch (error) {
        console.error("Error appending data:", error);
    }
}


//Save the data in arxiv_papers.json
export async function save_paper(link_as_string: string): Promise<void> {

    //To do

}


async function save_pdf(ctx: any) {

    const text: string = ctx.message.text;

    // Extract arxiv IDs
    const arxivIds: string[] = getArxivIds(text);

    //Save the cleaned metadata to arxiv_papers.json, right now this is only doing so for the arxivIds[0]
    if (arxivIds.length > 0) {
        await ctx.reply(`Extracted ${arxivIds.length} arXiv ID(s): ${arxivIds.join(', ')}`);
        const timestamp = ctx.message.date;
        const dateObject = new Date(timestamp * 1000);
        try {
            const metadata = await fetchArxivMetadata(arxivIds[0], dateObject);
            await appendMetadataToFile(metadata);


            await ctx.reply("Yay, it worked!'");

            await ctx.reply(`The message was received at: ${dateObject.toString()}`);
        }

        catch (error) {
            await ctx.reply("Failed to retrieve or append metadata.");
        }


    } else {
        await ctx.reply("Please write \"arxiv search\" to start");
    }

}
