//Created by Shrey Kavi

var BennyBot = require("./benny-bot");

// var token = process.env.BOT_API_KEY;
var name = process.env.BOT_NAME;

var bennybot = new BennyBot({
  token: "", //TODO: Must include a token here!
  name: name
});

bennybot.run();
