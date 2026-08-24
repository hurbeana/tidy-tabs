// Pulls a short summary out of a web page.
//
// A page already describes itself: the description meta tags are written for search
// engines and sharing, and the first heading says what the page leads with. Those few
// hundred words carry far more meaning than the whole body, which is mostly menus,
// cookie notices and footers.
//
// This function is sent into the page itself, so it must stand alone and must never
// throw. Anything it cannot find simply comes back empty.
export function readSummary(limit) {
  const meta = (selector) => document.querySelector(selector)?.content?.trim() ?? "";

  const described = meta('meta[name="description"]')
    || meta('meta[property="og:description"]')
    || meta('meta[name="twitter:description"]');

  const heading = document.querySelector("h1")?.textContent?.trim() ?? "";

  // The first few real paragraphs, skipping the short scraps that menus are made of.
  const paragraphs = [...document.querySelectorAll("article p, main p, p")]
    .map((p) => p.textContent.trim())
    .filter((text) => text.length > 60)
    .slice(0, 3);

  const everything = [described, heading, ...paragraphs].filter(Boolean).join(". ");
  const tidied = everything.replace(/\s+/g, " ").trim();

  if (tidied.length >= 80) return tidied.slice(0, limit);

  // A page with no summary of its own, such as an app screen, still has some text.
  const body = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();
  return `${tidied} ${body}`.trim().slice(0, limit);
}

// What the model reads for one tab. The address is included because a path such as
// /docs/compose/file says plainly what a page is, and the title sometimes does not.
export function wordsFor(tab) {
  return [tab.title, readableUrl(tab.url), tab.text].filter(Boolean).join(" — ");
}

// Turns an address into words. Separators become spaces, and the noise that every
// address carries is dropped.
export function readableUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "";
  }

  const host = parsed.hostname.replace(/^www\./, "");
  const path = decodeURIComponent(parsed.pathname)
    .replace(/\.(html?|php|aspx?)$/i, "")
    .replace(/[/\-_+]+/g, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return `${host} ${path} ${searchWords(parsed)}`.replace(/\s+/g, " ").trim();
}

// A search page keeps its whole meaning in the query, as in ?k=noise+cancelling.
// Only the values are worth reading, and only the ones that look like words rather
// than session ids or tracking codes.
function searchWords(parsed) {
  // Several words read as a phrase someone typed. A single run of letters and digits,
  // such as dQw4w9WgXcQ, is an identifier and means nothing to a reader or a model.
  const looksLikeWords = (value) => {
    if (value.length > 60) return false;
    if (value.includes(" ")) return /\p{L}{3}/u.test(value);
    return /^\p{L}{4,}$/u.test(value);
  };

  return [...parsed.searchParams.values()]
    .map((value) => value.replace(/[+_-]+/g, " ").trim())
    .filter(looksLikeWords)
    .slice(0, 3)
    .join(" ");
}
