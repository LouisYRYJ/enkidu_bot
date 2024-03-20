import { Bot, Context, session } from "grammy";
import {
    type Conversation,
    type ConversationFlavor,
    conversations,
    createConversation,
} from "@grammyjs/conversations";
import { update_query, startsWithKeyword, arxiv_search_results, arxiv_search_results_as_string } from './search_query_parser.js';


type MyContext = Context & ConversationFlavor;
type MyConversation = Conversation<MyContext>;

type SearchQuery = {
    title: string[];
    author: string[];
    summary: string[];
    publication_date: string[];
};


export async function arxiv_metasearch_conversation(conversation: MyConversation, ctx: MyContext) {
    const instruction = `To search the arxiv, you can use the following parameters
    
1\\. *title: title\\_query 1, \\.\\.\\.*
2\\. *author: last\\_name 1, \\.\\.\\.*
3\\. *summary: summary\\_query 1, \\.\\.\\.* or use *summary: \\+* to copy all the keywords from the title query 
4\\. *date: from 13\\.1\\.2019, until 13\\.1\\.2020*

    An example query might look like this:\`\`\` title: title 1, \\-title 2; date: from 13\\.1\\.2019, until 3.2022; summary: \\+\`\`\`
`;

    const syntax = ` Here are some general rules to keep in mind:

1\\. Seperate different parameters by \\"\\;\\"
2\\. You can exclude an item, by prepending \\-
3\\. You can specify your query over multiple messages
4\\. You can remove a query by replying to that message with the word \\"remove\\"
    
To start the search write *start search*\\. Cancel by writing *cancel search*
 `



    await ctx.reply(instruction, { parse_mode: "MarkdownV2" })
    await ctx.reply(syntax, { parse_mode: "MarkdownV2" })

    var current_query: SearchQuery = { title: [], author: [], summary: [], publication_date: [] };
    do {
        ctx = await conversation.wait();
        const keywords = ["title", "author", "date", "summary"];
        let remove_query = false;

        if (ctx.message && ctx.message.text) {

            let pieces = ctx.message.text.split(";");
            if (ctx.message.text.toLowerCase() === "remove" && ctx.message.reply_to_message && ctx.message.reply_to_message.text) {
                remove_query = true;
                pieces = ctx.message.reply_to_message.text.split(";");
            }

            pieces.forEach(piece => {
                let result = startsWithKeyword(piece, keywords);
                if (result.found && result.keyword && result.remainingText) {
                    current_query = update_query(result.keyword, result.remainingText, current_query, remove_query);
                }
            });

        }
        let outputString = "";

        for (const [key, value] of Object.entries(current_query)) {
            const output_key: string = key === "publication_date" ? "date" : key;
            outputString += `${output_key}: ${value.join(', ')};\n`;
        }

        if (ctx.message?.text?.trim().toLowerCase() !== "start search") {
            await ctx.reply(outputString);
        }


        if (ctx.message?.text === "cancel search") {
            await ctx.reply("Search cancelled!");
            return;
        }
    } while (ctx.message?.text?.trim().toLowerCase() !== "start search");


    const search_results = await arxiv_search_results(current_query);
    const response_with_formatting = arxiv_search_results_as_string(search_results)
    await ctx.reply(response_with_formatting.response_string,
        {
            link_preview_options: { is_disabled: true },
            entities: response_with_formatting.entities
        });

}


