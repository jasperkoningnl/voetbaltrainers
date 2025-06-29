/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/https");
const { onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const fetch = require("node-fetch");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

exports.enrichCoachData = onCall({ timeoutSeconds: 30 }, async (request) => {
  const names = Array.isArray(request.data.coaches) ? request.data.coaches : [];
  const results = [];

  for (const name of names) {
    let foto_url = "";
    try {
      const apiUrl =
        `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&titles=${encodeURIComponent(
          name
        )}&pithumbsize=400`;
      const res = await fetch(apiUrl);
      const data = await res.json();
      const pages = data.query && data.query.pages;
      if (pages) {
        const page = Object.values(pages)[0];
        const source = page?.thumbnail?.source;
        if (source) {
          try {
            const head = await fetch(source, { method: "HEAD" });
            if (head.ok) foto_url = source;
          } catch (err) {
            logger.error("Failed to verify image", err);
          }
        }
      }
    } catch (err) {
      logger.error("Wikipedia lookup failed", err);
    }

    results.push({ naam: name, nationaliteit: "", nat_code: "", foto_url });
  }

  return { coaches: results };
});
