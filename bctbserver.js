/* Boldchat test bot
 * This script should run under Node.js on local server
 */
// Version 0.1 30th July 2017
/* acronyms used in this script

*/
//****** Set up Express Server and socket.io
var http = require('http');
var https = require('https');
var app = require('express')();
var fs = require('fs');
var crypto = require('crypto');
var bodyParser = require('body-parser');
var decode = require('decode-html');

app.use(bodyParser.json());       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));

//********** Get port used by Heroku or use a default
var PORT = Number(process.env.PORT || 7979);
var server = http.createServer(app).listen(PORT);
var	io = require('socket.io').listen(server);

//******* Get BoldChat API Credentials
console.log("Reading API variables from config.json file...");
var EnVars;
var AID;
var SETTINGSID;
var KEY;

AID = process.env.AID || 0;
SETTINGSID = process.env.APISETTINGSID || 0;
KEY = process.env.APIKEY || 0;

if(AID == 0 || SETTINGSID == 0 || KEY == 0)
{
	console.log("BoldChat API Environmental Variables not set. Terminating!");
	process.exit(1);
}

console.log("Config loaded successfully");

//****** Callbacks for all URL requests
app.get('/', function(req, res){
	res.sendFile(__dirname + '/index.html');
});
app.get('/index.js', function(req, res){
	res.sendFile(__dirname + '/index.js');
});

// GET request used to test connectivity
app.get('/test', function(req, res){
	var str = "";
	res.send({"result": "success"});
	for(var key in req.query)
	{
		if(req.query.hasOwnProperty(key))
			str += key +":"+req.query[key]+",";
	}
	sendToLogs("Test Success: "+str);
});

// Process incoming Boldchat triggered chat message
app.post('/chatMessage', function(req, res){
	Exceptions.chatMessages++;
	res.send({ "result": "success" });
	sendToLogs("New Chat Message, chat id: "+req.body.ChatID);
	if(OperatorsSetupComplete)		//make sure all static data has been obtained first
		processChatMessage(req.body);
});

// Process incoming Boldchat triggered chat message
app.post('/chatStarted', function(req, res){
	Exceptions.chatStarted++;
	res.send({ "result": "success" });
	sendToLogs("Chat Started, chat id: "+req.body.ChatID);
	if(OperatorsSetupComplete)		//make sure all static data has been obtained first
		processChatStarted(req.body);
});

process.on('uncaughtException', function (err) {
  console.log('Exception: ' + err);
});

// Set up socket actions and responses
io.on('connection', function(socket){

	socket.on('operatorRequest', function(data){
		socket.emit('operatorResponse',Operators);
	});

	socket.on('departmentRequest', function(data){
		socket.emit('departmentResponse',Departments);
	});

  socket.on('assignOperatorRequest', function(opid){
    AssignedOperatorID = opid;
    var text = "Assigned to Operator: "+Operators[AssignedOperatorID].operatorName;
    io.sockets.in(MONITORROOM).emit('consoleLogs',text);
	});

	// join room which does the report every 3 mins and multicasts it to all subscribers
	socket.on('join room',function(room){
		console.log("Joining room "+room);
		socket.join(room);
//		socket.emit('chatMessage',object);
	});

	socket.on('disconnect', function(data){
		removeSocket(socket.id, "disconnect");
	});
	socket.on('error', function(data){
		removeSocket(socket.id, "error");
	});
	socket.on('end', function(data){
		removeSocket(socket.id, "end");
	});
	socket.on('connect_timeout', function(data){
		removeSocket(socket.id, "timeout");
	});
});

//********************************* Global class exceptions
var Exception = function() {
		this.APIJsonError = 0;
		this.noJsonDataMsg = 0;
    this.chatMessages = 0;		// daily chat messages
    this.chatStarted = 0;
};

//******* Global class for operator info
var OpMetrics = function(opid,name) {
		this.operatorID = opid;
		this.operatorName = name;
		this.chatMessages = 0;		// daily chat messages
};

//******* Global class for chat message
var ChatMessage = function(chatid) {
		this.chatID = chatid;
		this.name = "";
		this.date = ""; 	// date in ISO format
		this.text = "";		// the actual chat messages
};

//******************** Global constants for chat messages
const MONITORROOM = "monitor_room";	// socket room name for monitoring

//******************** Global variables for chat data
var	Departments;	// array of dept ids and dept name objects
var	Operators;	// array of operator ids and name objects
var AllChatMessages;
var ApiDataNotReady;	// Flag to show when data has been received from API so that data can be processed
var TimeNow;			// global for current time
var StartOfDay;			// global time for start of the day
var EndOfDay;			// global time for end of the day before all stats are reset
var Exceptions;
var AssignedOperatorID;

console.log("Server started on port "+PORT);
doStartOfDay();		// initialise everything

/*******************************************
/* Functions below this point
********************************************/

function doStartOfDay() {
	initialiseGlobals();	// zero all memory
	getApiData("getDepartments",0,deptsCallback);
	sleep(500);
	getApiData("getOperators",0,operatorsCallback);
	sleep(500);
}

function sleep(milliseconds) {
	var start = new Date().getTime();
	for(var i = 0; i < 1e7; i++)
	{
		if((new Date().getTime() - start) > milliseconds)
		{
			break;
		}
	}
}

function cleanText(mytext) {
	if(typeof mytext !== 'string') return(mytext);
	var clean = mytext.replace(/<\/?[^>]+(>|$)/g, "");	// take out html tags
	var clean2 = clean.replace(/(\r\n|\n|\r)/g,"");	// take out new lines
	var clean3 = clean2.replace(/["']/g,"");	// take out single and double quotes
	console.log("Clean Text: "+clean3);
	return(clean3);
}

function initialiseGlobals () {
	Departments = new Object();
	Operators = new Object();
	AllChatMessages = new Array();
	TimeNow = new Date();
	StartOfDay = new Date();
	EndOfDay = new Date();
	EndOfDay.setTime(StartOfDay.getTime() + ((24*60*60*1000) - 1));	// 24 hours less one milli from start of day
	console.log("Start of Day: "+StartOfDay.toISOString());
	console.log("End of Day: "+EndOfDay.toISOString());
	OperatorsSetupComplete = false;
	ApiDataNotReady = 0;
	Exceptions = new Exception();
}

// Set up code for outbound BoldChat API calls.  All of the capture callback code should ideally be packaged as an object.

function BC_API_Request(api_method,params,callBackFunction) {
	var auth = AID + ':' + SETTINGSID + ':' + (new Date()).getTime();
	var authHash = auth + ':' + crypto.createHash('sha512').update(auth + KEY).digest('hex');
	var options = {
		host : 'api-eu.boldchat.com',
		port : 443,
		path : '/aid/'+AID+'/data/rest/json/v1/'+api_method+'?auth='+authHash+'&'+params,
		method : 'GET',
		agent : false
	};
//	https.request(options, callBackFunction).on('error', function(err){console.log("API request error: "+err.stack)}).end();
	ApiDataNotReady++;		// flag to track api calls
	var getReq = https.request(options, function(res) {
//		console.log("\nstatus code: ", res.statusCode);
		var str = "";
		res.on('data', function(data) {
			str += data;
		});
		res.on('end', function() {
			ApiDataNotReady--;
			callBackFunction(str);
		});
		res.on('error', function(err){
			ApiDataNotReady--;
			console.log("API request error: ", err);
		});
	});
    //end the request
    getReq.end();
}

function debugLog(name, dataobj) {
	console.log(name+": ");
	for(key in dataobj)
	{
		if(dataobj.hasOwnProperty(key))
			console.log(key +":"+dataobj[key]);
	}
}

function sendToLogs(text) {
	console.log(text);
	io.sockets.in(MONITORROOM).emit('consoleLogs',text);
}

function deptsCallback(dlist) {
// sort alphabetically first
	dlist.sort(function(a,b) {
		var nameA=a.Name.toLowerCase();
		var nameB=b.Name.toLowerCase();
		if (nameA < nameB) //sort string ascending
			return -1;
		if (nameA > nameB)
			return 1;
		return 0; //default return value (no sorting)
	});

	for(var i in dlist)
	{
		Departments[dlist[i].DepartmentID] = dlist[i].Name;
	}
	sendToLogs("No of Depts: "+Object.keys(Departments).length);
}

function operatorsCallback(dlist) {
// sort alphabetically first
	dlist.sort(function(a,b) {
		var nameA=a.Name.toLowerCase();
		var nameB=b.Name.toLowerCase();
		if (nameA < nameB) //sort string ascending
			return -1;
		if (nameA > nameB)
			return 1;
		return 0; //default return value (no sorting)
	});

	for(var i in dlist)
	{
		Operators[dlist[i].LoginID] = new OpMetrics(dlist[i].LoginID,dlist[i].Name);
    if(dlist[i].Name.indexOf("Manji") !== -1)
    {
      AssignedOperatorID = dlist[i].LoginID;
      sendToLogs("Manji Operator ID: "+AssignedOperatorID);
    }
	}
	sendToLogs("No of Operators: "+Object.keys(Operators).length);
	OperatorsSetupComplete = true;
}

function addChatMessageCallback(info) {
	var str = "Chat Message: "+info;
	sendToLogs(str);
}

function assignChatCallback(info) {
	var str = "Assign Chat: "+info;
	sendToLogs(str);
}

// this function calls API again if data is truncated
function loadNext(method,next,callback,params) {
	var str = [];
	for(var key in next) {
		if (next.hasOwnProperty(key)) {
			str.push(encodeURIComponent(key) + "=" + encodeURIComponent(next[key]));
		}
	}
	getApiData(method,str.join("&"),callback,params);
}

// calls extraction API and receives JSON objects
function getApiData(method,params,fcallback,cbparam) {
	var emsg;
	BC_API_Request(method,params,function(str)
	{
		var jsonObj;
		try
		{
			jsonObj = JSON.parse(str);
		}
		catch (e)
		{
			Exceptions.APIJsonError++;
			emsg = TimeNow+ ": API did not return JSON message: "+str;
			sendToLogs(emsg);
			return;
		}
    var resp = jsonObj.Status;
    if(resp !== 'success')
    {
			Exceptions.APIJsonError++;
			emsg = TimeNow+ ":"+method+": Error: "+str;
			sendToLogs(emsg);
			return;
		}
		var data = new Array();
		data = jsonObj.Data;
		if(data === 'undefined' || data == null)
		{
      fcallback(jsonObj.Status);
		}
    else
		  fcallback(data,cbparam);

		var next = jsonObj.Next;
		if(typeof next !== 'undefined')
		{
			loadNext(method,next,fcallback,cbparam);
		}
	});
}

function objectToCsv(cmobj) {
	var str = "";
	for(var key in cmobj)
	{
		str = str +"\""+cmobj[key]+ "\",";
	}
//	str += "\r\n";
	return(str);
}

function getCsvChatMsgs() {
	var key, value;
	var csvChats = "";
	var tchat = new Object();
	// add csv header using first object
	key = Object.keys(AllChatMessages)[0];
	tchat = AllChatMessages[key];
	for(key in tchat)
	{
		csvChats = csvChats +key+ ",";
	}
	csvChats = csvChats + "\r\n";
	// now add the data
	for(var i in AllChatMessages)
	{
		tchat = AllChatMessages[i];
		for(key in tchat)
		{
			csvChats = csvChats +"\""+tchat[key]+ "\",";
		}
		csvChats = csvChats + "\r\n";
	}
	return(csvChats);
}

function processChatMessage(cMsg) {
	var cmobj = new ChatMessage(cMsg.ChatID);
	if(cMsg.EndedReasonType == "")	// this is a message not chat ended event
	{
    cmobj.name = cMsg.CMName;
    cmobj.text = cleanText(decode(cMsg.CMText));
    cmobj.date = cMsg.CMCreated;
    console.log("Text: "+decode(cMsg.CMText));
		if(cMsg.CMPersonType == 1)		// if visitor sent this
    {
      sendBotMessage(cmobj);
    }
//	debugLog("CMObject",cmobj);
	AllChatMessages.push(cmobj);
	io.sockets.in(MONITORROOM).emit('chatMessage',cmobj);
//	var csv = objectToCsv(cmobj);
//	postToFile(csv);
  }
}

function processChatStarted(obj) {
  var str = "ChatID="+obj.ChatID+"&OperatorID="+AssignedOperatorID+"&Forced=true";
  getApiData("assignChat",str,assignChatCallback);
  io.sockets.in(MONITORROOM).emit('consoleLogs',"New chat started and assigned to "+Operators[AssignedOperatorID].operatorName);
  io.sockets.in(MONITORROOM).emit('consoleLogs',"Initial Question "+obj.InitialQuestion);
}

function removeSocket(id,evname) {
	sendToLogs("Socket "+evname+" at "+ TimeNow);
}

function updateChatMsgTimer() {
	if(!OperatorsSetupComplete) return;		//try again later

	TimeNow = new Date();		// update the time for all calculations
	if(TimeNow > EndOfDay)		// we have skipped to a new day
	{
		console.log(TimeNow.toISOString()+": New day started, stats reset");
		setTimeout(doStartOfDay,10000);	//restart after 10 seconds to give time for ajaxes to complete
		return;
	}
}

function sendBotMessage(cobj) {
  var botm;

  if(cobj.text.indexOf("hello") !== -1 || cobj.text.indexOf("hi") !== -1)
      botm = "Hi "+cobj.name+" how are you?";
  else if(cobj.text.indexOf("question") !== -1 || cobj.text.indexOf("have") !== -1)
          botm = cobj.name+", what is your question?";
  else if(cobj.text.indexOf("help") !== -1 || cobj.text.indexOf("please") !== -1)
      botm = cobj.name+", how can I help you?";
  else if(cobj.text.indexOf("bye") !== -1 || cobj.text.indexOf("ciao") !== -1)
      botm = "Goodbye "+cobj.name+", talk to you soon";
  else
      botm = "Sorry "+cobj.name+", I dont understand, I am only a simple bot";

  var str = "ChatID="+cobj.chatID+"&Type=operator&Message="+encodeURIComponent(botm)+"&OperatorID="+AssignedOperatorID;
  getApiData("addChatMessage",str,addChatMessageCallback);
}

function postToFile(postdata) {
	var options = {
		host : 'uber-electronics.com',
		port : 443,
		path : '/home/mkerai/APItriggers/cmtestmessages.php',
		method : 'POST',
		headers: {
          'Content-Type': 'text/plain',
          'Content-Length': Buffer.byteLength(postdata)
		}
	};
	var post_req = https.request(options, function(res){
		res.setEncoding('utf8');
		res.on('data', function (chunk) {
//			console.log('Response: ' + chunk);
			});
		});
	post_req.write(postdata);
	post_req.end();
	post_req.on('error', function(err){console.log("HTML error"+err.stack)});
	console.log("Post to file complete");
}
