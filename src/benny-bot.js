'use strict';

const Bot = require('slackbots');
const translate = require('google-translate-api');
var util = require('util');
//database vars
var path = require('path');
var fs = require('fs');
var SQLite = require('sqlite3').verbose();

var BennyBot = function constructor(settings) {
    this.settings = settings;
    this.settings.name = 'benny-bot';
    this.dbPath = path.resolve(process.cwd(), 'data', 'bennybot.db');

    this.db = null;
    this.user = null;
    this.translationsCount = 0;
    this.listOfTranslators = [];
    this.translatorsCount = 0;
};

// inherits methods and properties from the Bot constructor
util.inherits(BennyBot, Bot);

module.exports = BennyBot;

BennyBot.prototype.run = function () {
    BennyBot.super_.call(this, this.settings);
    this.on('start', this._onStart);
    this.on('message', this._onMessage);
}

BennyBot.prototype._onStart = function () {
    var self = this;

    //start message
    this.postMessageToChannel('bot-lab', 'Hi everyone, I am benny-bot.\n I can help with translating English to French. Say `@benny-bot help` if you would like to know how I work.', { as_user: true });

    //connects to DB
    if (!fs.existsSync(this.dbPath)) {
        console.error('Database path ' + '"' + this.dbPath + '" does not exists or it\'s not readable.');
        process.exit(1);
    }
    this.db = new SQLite.Database(this.dbPath);

    //sets translationCount
    this.db.each('SELECT COUNT(id) AS count FROM translations', function(err, row){
        self.translationsCount = row.count;
    });

    //counts translators
    this.db.each('SELECT id, name FROM translators', function(err, row){
        if( row.id > self.translatorsCount ){
            self.translatorsCount = row.id;
        }
        self.listOfTranslators.push(row.name);
    });

    //takes note of itself as a user
    this.user = this.users.filter(function (user) {
        return user.name === self.name;
    })[0];
};

BennyBot.prototype._onMessage = function (message) {
    console.log(message);
    if (this._isChatMessage(message) &&
        this._isChannelConversation(message) &&
        !this._isFromBennyBot(message) &&
        this._isMentioningBenny(message)
    ) {
        //gets user who made call
        if (message.content.toLowerCase().indexOf('translate:') > -1) {
            this._replyWithFrench(message);
        }
        else if (message.content.toLowerCase().indexOf('confirm #') > -1) {
            this._confirmTranslation(message);
        }
        else if (message.content.toLowerCase().indexOf('status #') > -1) {
            this._checkTranslationStatus(message);
        }
        else if (message.content.toLowerCase().indexOf('add translator') > -1) {
            this._addBilingualUser(message);
        }
        else if (message.content.toLowerCase().indexOf('remove translator') > -1) {
            this._removeBilingualUser(message);
        }
        else if (message.content.toLowerCase().indexOf('list translators') > -1) {
            this._listBilingualUsers();
        }
        else if (message.content.toString().toLowerCase().indexOf('help') > -1) {
            this.postMessageToChannel('bot-lab', 'Here is a list of my commands:\n*Please note the id #1 is used as an example here* \n  `@benny-bot translate: text to be translate` \n  `@benny-bot confirm #1 [yes|no]` \n  `@benny-bot status #1` \n  `@benny-bot add translator @[username]` \n  `@benny-bot remove translator @[username]` \n  `@benny-bot list translators` \nTry me out!!', { as_user: true, "link_names": 1, "parse": "full" });
        }
        else if (message.content.toLowerCase().indexOf('Who is your god?') > -1) {
            this.postMessageToChannel('bot-lab', 'Shrey Kavi is my great creator!', { as_user: true, "link_names": 1, "parse": "full" });
        }
        else{
            this.postMessageToChannel('bot-lab', 'Sorry I didn\'t understand that command. \nType `@benny-bot help` for more information.', { as_user: true, "link_names": 1, "parse": "full" });
        }
    }
};

BennyBot.prototype._isChatMessage = function (message) {
    return message.type === 'desktop_notification' && Boolean(message.content);
};

BennyBot.prototype._isChannelConversation = function (message) {
    return typeof message.channel === 'string' && message.channel[0] === 'C';
};

BennyBot.prototype._isFromBennyBot = function (message) {
    return message.user === this.user.id;
};

BennyBot.prototype._isMentioningBenny = function (message) {
    return message.content.toLowerCase().indexOf('@benny-bot') > -1;
};

BennyBot.prototype._replyWithFrench = function (originalMessage) {
    var self = this;
    var translatedInPast = false;
    var formatedListOfTranslatingUsers = '';
    var user = originalMessage.content.split(':')[0];
    // var channel =  self._getReturnById(originalMessage.channel);

    //cleans up input test
    var user_text = originalMessage.content.toLowerCase().split('translate: ')[1];
    user_text = user_text.replace('`',' ').replace('"','').replace('\'','');
    console.log(user_text);
    
    //get translators
    self.listOfTranslators.forEach(function(translatingUser) {
        console.log(translatingUser);
        formatedListOfTranslatingUsers += ' @'+ translatingUser
    }, this);

    //promise makes sure to sync checking before doing next steps
    var alreadyTranslated = this._checkIfAlreadyTranslated(user_text, this.translationsCount);
    alreadyTranslated.then(function(resolved){
        if(resolved.length < 1){
            self.translationsCount++;
            translate(user_text, { to: 'fr' }).then(res => {
                self.postMessageToChannel('bot-lab', '@'+ user + '\nHere is your translation ID #' + self.translationsCount + '\nYour Translation:\n`' + res.text + '`\n' + formatedListOfTranslatingUsers + ' does this look right?', { as_user: true, "link_names": 1, "parse": "full" });

                //write to DB
                self.db.run('INSERT INTO translations VALUES (' + self.translationsCount + ',"' + user_text + '","'+ res.text +'","not confirmed","' + user + '")');
            }).catch(err => {
                console.error(err);
            });
        }
        else{
            switch(resolved[0].confirmation){
                case "yes":
                    self.postMessageToChannel('bot-lab', '@'+user + ' This has already been translated and confirmed.\nThe id# is '+ resolved[0].id + ' and the french translation is `' + resolved[0].french + '`', { as_user: true, "link_names": 1, "parse": "full" });
                    break;
                case "no":
                    self.postMessageToChannel('bot-lab', '@'+user + ' The returned translation here was said to be incorrect.\nThe id# is '+ resolved[0].id + ' and the french translation is `' + resolved[0].french + '`', { as_user: true, "link_names": 1, "parse": "full" });
                    break;
                case "not confirmed":
                    self.postMessageToChannel('bot-lab', '@'+user + ' This has already been translated but *NOT* confirmed.\nThe id# is '+ resolved[0].id + ' and the french translation is `' + resolved[0].french + '`', { as_user: true, "link_names": 1, "parse": "full" });
                    break;
                default:
                    self.postMessageToChannel('bot-lab', '@'+user + ' This has already been translated but *NOT* confirmed.\nThe id# is '+ resolved[0].id + ' and the french translation is `' + resolved[0].french + '`', { as_user: true, "link_names": 1, "parse": "full" });
                    break;
            }
        }    
    }).catch(function(error){
        console.log(error);
    });
};

BennyBot.prototype._checkIfAlreadyTranslated = function (text, lastId) {
    var self=this;
    var arrayOfConfirmation = [];
    return new Promise(function (resolve,reject){  
        //first translation ever mean DB empty
        if(lastId == 0){
            resolve(arrayOfConfirmation);
        }
        
        //checks if its been translated in the past
        //for loop makes sure ids go in order
        for(var i = 1; i <= self.translationsCount; i++){
            self.db.each('SELECT confirmation, french, english, id FROM translations WHERE id = "' + i + '"', function(err, row){
                if(row.english == text){
                    arrayOfConfirmation.push(row);
                }

                if (row.id == lastId){
                    resolve(arrayOfConfirmation);
                }
            });
        }
    });
}


BennyBot.prototype._confirmTranslation = function (message) {
    var self = this;
    var idFromMessage = message.content.split(" ")[message.content.split(" ").toLowerCase().indexOf('confirm') + 1].replace('#', '');
    var user = message.content.split(':')[0];
    console.log('being confirmed by ' + user);
    if(!isNaN(idFromMessage)){
        var alreadyUser = self._checkIfUserBilingual(user);
        alreadyUser.then(function(resolved){
            //if user is not translator
            if (resolved.length == 0){
                self.postMessageToChannel('bot-lab', '@' + user + ' You are not an authorized translator!', { as_user: true, "link_names": 1, "parse": "full" });
            }
            else{ //if user is translator
                //CHANGE: EDIT TO SEND BACK TO OG REQUESTER
                var getRequester = self._getOriginalTranslationRequester(idFromMessage);
                getRequester.then(function(originalRequest){
                    console.log("got out of promise")
                    var dbStatus = null;
                    if (message.content.toLowerCase().indexOf(' yes') > -1) {
                        self.postMessageToChannel('bot-lab', '@' + originalRequest.requester + ' your request with ID# ' +idFromMessage+ '\nto translate:`'+ originalRequest.english +'`\nwas confirmed to be `'+ originalRequest.french +'`!', { as_user: true, "link_names": 1, "parse": "full" });
                        dbStatus = 'yes';
                    }
                    else if (message.content.toLowerCase().indexOf(' no') > -1) {
                        self.postMessageToChannel('bot-lab', '@' + originalRequest.requester + ' uhh ohh..\nYour request with ID# ' +idFromMessage+ '\nto translate:`'+ originalRequest.english +'`\nwas *INCORRECTLY* translated to: `'+ originalRequest.french +'`!', { as_user: true, "link_names": 1, "parse": "full" });
                        dbStatus = 'no';
                    }
                    else {
                        self.postMessageToChannel('bot-lab', '@' + user +' its a yes or no question :unamused:', { as_user: true, "link_names": 1, "parse": "full" });
                        dbStatus = 'not confirmed';
                    }
                
                    //write to DB
                    self.db.run('UPDATE translations SET confirmation = "'+ dbStatus +'" WHERE id = ' + idFromMessage);

                });
            }
        });
    }
    else{
        this.postMessageToChannel('bot-lab', 'Couldn\'t find the id#. Try `@benny-bot help`' , { as_user: true, "link_names": 1, "parse": "full" });
    }
}

BennyBot.prototype._getOriginalTranslationRequester = function (id) {
    var self=this;
    return new Promise(function (resolve,reject){  
        //gets original translator
        console.log('gets to promise');
        console.log(id);
        self.db.each('SELECT id ,english, french ,requester FROM translations WHERE id = "' + id + '"', function(err, row){
            console.log('found DB request')
            console.log(row);
            resolve(row);
        });
    });
}

BennyBot.prototype._checkTranslationStatus = function (message) {
    var self = this;
    var idFromMessage = message.content.split(" ")[message.content.split(" ").toLowerCase().indexOf('status') + 1].replace('#', '');
    if(!isNaN(idFromMessage)){
        this.db.each('SELECT confirmation,french FROM translations WHERE id = ' + idFromMessage, function(err, row){
            var status;
            switch (row.confirmation){
                case "yes":
                    status = 'The translation was:`'+ row.french +'`\nYes this is the correct French translation.';
                    break;
                case "no":
                    status = 'The translation was:`'+ row.french +'`\nNo this is not the correct French translation.';
                    break;
                case "not confirmed":
                    status = 'The translation was:`'+ row.french +'`\nThis text was never verified.';
                    break;
                case "default":
                    status = 'The translation was:`'+ row.french +'`\nThis text was never verified.';
                    break;
            }
            self.postMessageToChannel('bot-lab', status+"", { as_user: true, "link_names": 1, "parse": "full" });
        });
    }
    else {
        this.postMessageToChannel('bot-lab', 'Couldn\'t find the id #. Try `@benny-bot help`' , { as_user: true, "link_names": 1, "parse": "full" });
    }    
}

BennyBot.prototype._addBilingualUser = function (message) {
    var self = this;
    var user = message.content.split(' ');
    user = user[user.toLowerCase().indexOf("translator") + 1].replace('@','');
    this.getUser(user).then(function(resolved){
        if(resolved.name != undefined){
            //promise makes sure to sync checking before doing next steps
            var alreadyUser = self._checkIfUserBilingual(user);
            alreadyUser.then(function(resolved){
                if (resolved.length == 0){
                    //write to DB
                    self.translatorsCount++;
                    self.listOfTranslators.push(user)
                    self.db.run('INSERT INTO translators VALUES ("' + self.translatorsCount + '","' + user + '")');
                    self.postMessageToChannel('bot-lab', 'Translator has been verified and added.' , { as_user: true, "link_names": 1, "parse": "full" });
                }
                else{
                    self.postMessageToChannel('bot-lab', 'This user is already a translator.' , { as_user: true, "link_names": 1, "parse": "full" });
                }
            });
        }
        else {
            self.postMessageToChannel('bot-lab', 'This username does not exist.' , { as_user: true, "link_names": 1, "parse": "full" });
        }
    });
}

BennyBot.prototype._removeBilingualUser = function (message) {
    var self = this;
    var user = message.content.split(' ');
    user = user[user.toLowerCase().indexOf("translator") + 1].replace('@','');
    this.getUser(user).then(function(resolved){
        if(resolved.name != undefined){
            //promise makes sure to sync checking before doing next steps
            var alreadyUser = self._checkIfUserBilingual(user);
            alreadyUser.then(function(resolved){
                if (resolved.length > 0){
                    //write to DB
                    self.db.run('DELETE FROM translators WHERE name = "' + user + '"');
                    self.postMessageToChannel('bot-lab', 'Translator has been verified and removed.' , { as_user: true, "link_names": 1, "parse": "full" });
                }
                else{
                    self.postMessageToChannel('bot-lab', 'This user is not a translator.' , { as_user: true, "link_names": 1, "parse": "full" });
                }
            });
        }
        else {
            self.postMessageToChannel('bot-lab', 'This username does not exist.' , { as_user: true, "link_names": 1, "parse": "full" });
        }
    });
}

BennyBot.prototype._checkIfUserBilingual = function (user) {
    var self=this;
    var arrayOfConfirmation = [];
    return new Promise(function (resolve,reject){  
        //first translator ever means DB empty
            if(self.translatorsCount < 1){
                resolve(arrayOfConfirmation);
            }
        //checks if its been translated in the past
        for(var i = 1; i <= self.translatorsCount; i++){
            self.db.each('SELECT id,name FROM translators WHERE id = "' + i + '"', function(err, row){
                if(row.name != undefined){
                    if(row.name == user){
                        arrayOfConfirmation.push(row);
                    }
                    if(row.id == self.translatorsCount){
                        resolve(arrayOfConfirmation);
                    }
                }
            });
        }
    });
}

BennyBot.prototype._listBilingualUsers = function () {
    var self = this;
    self.listOfTranslators.forEach(function(translatingUser) {
        self.postMessageToChannel('bot-lab', '@'+ translatingUser , { as_user: true, "link_names": 1, "parse": "full" });
    }, this);
}

BennyBot.prototype._getReturnById = function (channelId) {
    return this.channels.filter(function (item) {
        return item.id === channelId;
    })[0];
};