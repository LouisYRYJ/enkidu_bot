import { Bot, Context, session } from 'grammy';
import { getArxivIds, fetchArxivMetadata, appendMetadataToFile } from './extract.js';
import {
    type Conversation,
    type ConversationFlavor,
    conversations,
    createConversation,
} from "@grammyjs/conversations";

import { arxiv_metasearch_conversation } from './arxiv_search.js';

type MyContext = Context & ConversationFlavor;
type MyConversation = Conversation<MyContext>;

const token = 'BOT_TOKEN_HERE';
const bot = new Bot<MyContext>(token);




bot.use(session({ initial: () => ({}) }));

bot.use(conversations());

bot.command("start", async (ctx) => {

    await ctx.reply("Hey, I go through the pile of arXiv papers so that you don't have to! 🫡 ")
    await ctx.reply(
        ` - To start a search, write \"arxiv search\".
- Follow the instructions and write "start search" to get the results. 
- Use "cancel search" to cancel the query.
    `)
});

bot.use(createConversation(arxiv_metasearch_conversation));
bot.on('message:text', async (ctx, next) => {
    if (ctx.message.text.trim().toLowerCase() === "arxiv search") {
        await ctx.conversation.enter("arxiv_metasearch_conversation");
    }
    else {
        await next();
    }
})


bot.on('message:text', async (ctx) => {
    await ctx.reply("Please write \"arxiv search\" to start");
}

);





bot.start();


