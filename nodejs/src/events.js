/*
 * Events
 * ******
 *
 * This example demonstrates using Cortex to subscribe to events for mental
 * commands and facial expressions. We take all the different kinds and
 * combine them together into a single event that only fires when something's
 * changed.
 *
 * It also accepts a threshold for how confident it should be before it
 * reports a result.
 *
 * If require()d as a library, it should be called with a callback function
 * like this:
 *     const onEvent = require('./events')
 *     onEvent(client, threshold, (event) => console.log('got an event!', event))
 *
 * If you run it from the command line it will do this for you and just print
 * out events as they happen.
 *
 * Format of data : facial expressions and mental commands
 * subs[1].fac.cols
 * data.eyeAct    eye direction
 * data.uAct      brows action
 * data.uPow      brows power rating
 * data.lAct      mouth action
 * data.lPow      mouth power rating
 * 
 * subs[0].com.cols
 * data.act       
 * data.pow
 */

const Cortex = require("../lib/cortex");

// Small wrapper function  to turn the column-oriented format we get from the
// API into key:value pairs
const columns2obj = headers => cols => {
  const obj = {};
  for (let i = 0; i < cols.length; i++) {
    obj[headers[i]] = cols[i];
  }
  return obj;
};

function events(client, threshold, onResult) {

  // First we're setting up the streams of data
  // - create session
  // - suscribe to streams
  // - verify that data is not empty
  return client
    .createSession({ status: "open" })
    .then(() => client.subscribe({ streams: ["com", "fac"] }))
    .then(subs => {
      if (!subs[0].com || !subs[1].fac) throw new Error("failed to subscribe");
      
      // this will save temporarily the result 
      const current = {
        command: "neutral",
        eyes: "neutral",
        brows: "neutral",
        mouth: "neutral"
      };

      // Then we listen to facial expressions when "fac" comes from the stream
      // - formatting data subs[1].fac.cols to key:value pairs
      // - update function
      const fac2obj = columns2obj(subs[1].fac.cols);
      const onFac = ev => {
        const data = fac2obj(ev.fac);
        let updated = false;
        let update = (k, v) => {
          if (current[k] !== v) {
            updated = true;
            current[k] = v;
          }
        };

        // ... and update the result
        // - eye direction doesn't have a power rating, so we send every change
        // - power threshold
        // - [question] it should verify that update is completed ... but here it changes to true on first update! not on the last update ...
        update("eyes", data.eyeAct);
        if (data.uPow >= threshold) update("brows", data.uAct);
        if (data.lPow >= threshold) update("mouth", data.lAct);
        if (updated) onResult(Object.assign({}, current));
      };
      client.on("fac", onFac);

      // And here we do mental commands when "com" comes from the stream
      // - formatting subs[0].com.cols to key:value pairs
      // - updating result
      const com2obj = columns2obj(subs[0].com.cols);
      const onCom = ev => {
        const data = com2obj(ev.com);
        if (data.act !== current.command && data.pow >= threshold) {
          current.command = data.act;
          onResult(Object.assign({}, current));
        }
      };
      client.on("com", onCom);

      // Last, we return a function to call to finish up
      // - unsuscribe streams
      // - close session
      // - remove listeners
      return () =>
        client
          .unsubscribe({ streams: ["com", "fac"] })
          .then(() => client.updateSession({ status: "close" }))
          .then(() => {
            client.removeListener("com", onCom);
            client.removeListener("fac", onFac);
          });
    });
}

// Small function to format a string to a specified length
const pad = (str, n) =>
  str + new Array(Math.max(0, n - str.length + 1)).join(" ");

// This is the main module that gets evaluated when you run it from the command line
if (require.main === module) {
  // Node js process other errors
  process.on("unhandledRejection", err => {
    throw err;
  });
  
  // Arguments
  // - we can set LOG_LEVEL=2 or 3 for more detailed errors
  // - threshold is set here
  const verbose = process.env.LOG_LEVEL || 1;
  const options = { verbose, threshold: 0 };
  const threshold = 0;

  const client = new Cortex(options);

  // Client 
  // 
  client.ready.then(() => client.init()).then(() => {
    console.log(
      `Watching for facial expressions and mental commands above ${Math.round(
        threshold * 100
      )}% power`
    );

    events(client, threshold, ({ eyes, brows, mouth, command }) => {
      console.log(
        `eyes: ${pad(eyes, 10)} | brows: ${pad(brows, 10)} | mouth: ${pad(
          mouth,
          10
        )} | command: ${command}`
      );
    });
  });

  // We could use the value returned by events() here, but when we ctrl+c it
  // will clean up the connection anyway
}

module.exports = events;
