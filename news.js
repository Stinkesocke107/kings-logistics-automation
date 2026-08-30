const fs = require("fs");
const path = require("path");


// ======================================================
// KINGS LOGISTICS — TRUCKERSMP NEWS AUTOMATION
// ======================================================

const KINGS_VTC_ID = 64284;

const NEWS_API_URL =
  `https://api.truckersmp.com/v2/vtc/${KINGS_VTC_ID}/news`;

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
// HELPERS
// ======================================================

function cleanText(text = "") {
  return String(text)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
// LOAD TRUCKERSMP VTC NEWS
// ======================================================

async function getNews() {
  console.log(
    "Loading Kings Logistics TruckersMP News API..."
  );

  const response =
    await fetch(
      NEWS_API_URL,
      {
        headers: {
          "Accept":
            "application/json",

          "User-Agent":
            "Kings Logistics GitHub Automation"
        }
      }
    );


  if (!response.ok) {
    throw new Error(
      `TruckersMP News API request failed: HTTP ${response.status}`
    );
  }


  const data =
    await response.json();


  if (
    data.error === true ||
    !data.response ||
    !Array.isArray(
      data.response.news
    )
  ) {
    throw new Error(
      "Invalid TruckersMP VTC News API response."
    );
  }


  const news =
    data.response.news
      .map(item => ({
        id:
          Number(item.id),

        title:
          item.title || "Kings Logistics News",

        description:
          cleanText(
            item.content_summary || ""
          ),

        author:
          item.author || "Kings Logistics",

        publishedAt:
          item.published_at || null,

        updatedAt:
          item.updated_at || null,

        url:
          `https://truckersmp.com/vtc/${KINGS_VTC_ID}/news/${item.id}`
      }))
      .filter(
        item =>
          Number.isFinite(item.id)
      );


  /*
    Sort newest -> oldest.
  */

  news.sort(
    (a, b) => {
      const dateA =
        new Date(
          a.publishedAt || 0
        ).getTime();

      const dateB =
        new Date(
          b.publishedAt || 0
        ).getTime();

      return dateB - dateA;
    }
  );


  if (news.length === 0) {
    throw new Error(
      "No Kings Logistics news posts were returned by TruckersMP."
    );
  }


  console.log(
    `Loaded ${news.length} Kings Logistics news post(s).`
  );

  console.log(
    `Latest news: ${news[0].title}`
  );


  return news;
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

    return JSON.parse(
      raw
    );
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
      newsItem.url,

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
      newsItem.url,

    description:
      description,

    color:
      KINGS_COLOR
  };


  /*
    Add original publication time.
  */

  if (
    newsItem.publishedAt
  ) {
    const date =
      new Date(
        newsItem.publishedAt
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


  // ====================================================
  // FIRST RUN
  // ====================================================

  /*
    First GitHub run:

    Remember the newest current article,
    but DO NOT post an old article to Discord.

    Only articles published afterwards
    will be posted automatically.
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


  // ====================================================
  // NOTHING NEW
  // ====================================================

  if (
    Number(latest.id) ===
    Number(state.lastId)
  ) {
    console.log("");
    console.log(
      "No new Kings Logistics news found."
    );

    return;
  }


  // ====================================================
  // FIND ALL NEW ARTICLES
  // ====================================================

  const oldIndex =
    news.findIndex(
      item =>
        Number(item.id) ===
        Number(state.lastId)
    );


  let newItems;


  if (
    oldIndex > 0
  ) {
    /*
      Example:

      Article 105 <- newest
      Article 104
      Article 103 <- previous saved one

      We send:
      104 first
      105 second
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
      If our old article is no longer returned
      by the API, send only the newest article.

      This prevents old-news spam.
    */

    console.log(
      "Previous saved news was not found in the current API response."
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
    `${newItems.length} new Kings Logistics news post(s) detected.`
  );


  // ====================================================
  // SEND OLDEST -> NEWEST
  // ====================================================

  for (
    const item
    of newItems
  ) {
    await sendToDiscord(
      item
    );
  }


  /*
    Only save state after Discord succeeded.
  */

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
