const fs = require("fs");
const path = require("path");


// ======================================================
// KINGS LOGISTICS — TRUCKERSMP NEWS AUTOMATION
// ======================================================

const RSS_URL =
  "https://truckersmp.com/vtc/64284/news/rss";

const DISCORD_WEBHOOK_URL =
  process.env.NEWS_DISCORD_WEBHOOK_URL;

const STATE_FILE =
  path.join(
    __dirname,
    "data",
    "last-news.json"
  );

const KINGS_COLOR =
  parseInt("182dff", 16);


// ======================================================
// SMALL HELPERS
// ======================================================

function decodeXmlEntities(text = "") {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(
        parseInt(hex, 16)
      )
    )
    .replace(/&#([0-9]+);/g, (_, number) =>
      String.fromCodePoint(
        parseInt(number, 10)
      )
    );
}


function cleanText(text = "") {
  return decodeXmlEntities(
    text
      .replace(
        /<!\[CDATA\[([\s\S]*?)\]\]>/g,
        "$1"
      )
      .replace(
        /<br\s*\/?>/gi,
        "\n"
      )
      .replace(
        /<\/p>/gi,
        "\n"
      )
      .replace(
        /<[^>]+>/g,
        ""
      )
  )
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


function extractTag(xml, tag) {
  const regex =
    new RegExp(
      `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
      "i"
    );

  const match =
    xml.match(regex);

  if (!match) {
    return "";
  }

  return cleanText(match[1]);
}


function truncate(text, maxLength) {
  if (!text) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return (
    text.slice(
      0,
      maxLength - 3
    ) + "..."
  );
}


// ======================================================
// LOAD TRUCKERSMP RSS
// ======================================================

async function getNews() {
  console.log(
    "Loading Kings Logistics TruckersMP RSS..."
  );

  const response =
    await fetch(RSS_URL, {
      headers: {
        "User-Agent":
          "Kings Logistics News Automation"
      }
    });

  if (!response.ok) {
    throw new Error(
      `TruckersMP RSS request failed: HTTP ${response.status}`
    );
  }

  const xml =
    await response.text();

  const itemRegex =
    /<item\b[^>]*>([\s\S]*?)<\/item>/gi;

  const items = [];

  let match;

  while (
    (match = itemRegex.exec(xml)) !== null
  ) {
    const itemXml =
      match[1];

    const title =
      extractTag(
        itemXml,
        "title"
      );

    const link =
      extractTag(
        itemXml,
        "link"
      );

    const description =
      extractTag(
        itemXml,
        "description"
      );

    const pubDate =
      extractTag(
        itemXml,
        "pubDate"
      );

    const guid =
      extractTag(
        itemXml,
        "guid"
      );

    /*
      GUID is preferred as the unique ID.
      The link is used as fallback.
    */

    const id =
      guid ||
      link ||
      title;

    if (
      title &&
      link &&
      id
    ) {
      items.push({
        id,
        title,
        link,
        description,
        pubDate
      });
    }
  }

  if (items.length === 0) {
    throw new Error(
      "No TruckersMP news items were found in the RSS feed."
    );
  }

  console.log(
    `Loaded ${items.length} TruckersMP news item(s).`
  );

  console.log(
    `Latest news: ${items[0].title}`
  );

  return items;
}


// ======================================================
// STATE — REMEMBER LAST NEWS
// ======================================================

function loadState() {
  if (
    !fs.existsSync(
      STATE_FILE
    )
  ) {
    return null;
  }

  try {
    const raw =
      fs.readFileSync(
        STATE_FILE,
        "utf8"
      );

    return JSON.parse(raw);
  } catch (error) {
    console.error(
      "Could not read previous news state."
    );

    return null;
  }
}


function saveState(newsItem) {
  const directory =
    path.dirname(
      STATE_FILE
    );

  fs.mkdirSync(
    directory,
    {
      recursive: true
    }
  );

  const state = {
    lastId:
      newsItem.id,

    lastTitle:
      newsItem.title,

    lastUrl:
      newsItem.link,

    updatedAt:
      new Date().toISOString()
  };

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      state,
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(
    "News state updated."
  );
}


// ======================================================
// SEND NEWS TO DISCORD
// ======================================================

async function sendToDiscord(newsItem) {
  if (!DISCORD_WEBHOOK_URL) {
    throw new Error(
      "NEWS_DISCORD_WEBHOOK_URL is missing."
    );
  }

  let description =
    newsItem.description;

  if (!description) {
    description =
      "A new Kings Logistics news post has been published on TruckersMP.";
  }

  description =
    truncate(
      description,
      4000
    );


  const embed = {
    author: {
      name:
        "Kings Logistics"
    },

    title:
      truncate(
        newsItem.title,
        256
      ),

    url:
      newsItem.link,

    description:
      description,

    color:
      KINGS_COLOR
  };


  /*
    If the RSS feed contains a valid
    publication date, Discord receives it too.
  */

  if (
    newsItem.pubDate
  ) {
    const date =
      new Date(
        newsItem.pubDate
      );

    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {
      embed.timestamp =
        date.toISOString();
    }
  }


  const response =
    await fetch(
      DISCORD_WEBHOOK_URL,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            content:
              "Kings Logistics just published a news post!",

            embeds: [
              embed
            ]
          })
      }
    );


  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `Discord webhook failed: HTTP ${response.status} - ${errorText}`
    );
  }


  console.log(
    `Discord post sent: ${newsItem.title}`
  );
}


// ======================================================
// CHECK FOR NEW NEWS
// ======================================================

async function checkNews() {
  const news =
    await getNews();

  const latest =
    news[0];

  const state =
    loadState();


  /*
    FIRST RUN

    On the very first GitHub run we only remember
    the current newest TruckersMP article.

    We DO NOT post an old article to Discord.

    Everything published AFTER this point
    can then be detected automatically.
  */

  if (
    !state ||
    !state.lastId
  ) {
    console.log("");
    console.log(
      "First run detected."
    );

    console.log(
      "Saving current latest news without posting it to Discord."
    );

    saveState(
      latest
    );

    return;
  }


  /*
    No new article.
  */

  if (
    latest.id ===
    state.lastId
  ) {
    console.log("");
    console.log(
      "No new Kings Logistics news found."
    );

    return;
  }


  /*
    Find the previously posted article
    inside the current RSS feed.
  */

  const oldIndex =
    news.findIndex(
      item =>
        item.id ===
        state.lastId
    );


  let newItems;


  if (
    oldIndex > 0
  ) {
    /*
      Several articles could theoretically
      have been published between checks.

      Send them oldest -> newest.
    */

    newItems =
      news
        .slice(
          0,
          oldIndex
        )
        .reverse();
  } else {
    /*
      If the old item is no longer present
      in the RSS feed, send only the newest
      article instead of potentially spamming
      many old posts.
    */

    console.log(
      "Previous news item was not found in the current RSS feed."
    );

    console.log(
      "Only the latest article will be sent."
    );

    newItems = [
      latest
    ];
  }


  console.log("");
  console.log(
    `${newItems.length} new Kings Logistics news item(s) detected.`
  );


  /*
    IMPORTANT:
    State is only updated AFTER every Discord
    message was sent successfully.

    If Discord fails, GitHub can retry the
    article during a later workflow run.
  */

  for (
    const item
    of newItems
  ) {
    await sendToDiscord(
      item
    );
  }


  saveState(
    latest
  );
}


// ======================================================
// START
// ======================================================

async function start() {
  console.log(
    "=================================="
  );

  console.log(
    "Kings Logistics News Automation"
  );

  console.log(
    "=================================="
  );

  console.log("");

  await checkNews();

  console.log("");
  console.log(
    "Kings News check completed successfully."
  );
}


start().catch(error => {
  console.error("");
  console.error(
    "Kings News Automation failed:"
  );

  console.error(
    error
  );

  process.exit(1);
});
