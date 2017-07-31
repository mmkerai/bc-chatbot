var socket = io.connect();
const MONITORROOM = "monitor_room";		// socket room name for monitoring this service
var Operators = new Object();
/*Operators["12345"] = "Op1";
Operators["23456"] = "Op2";
*/
function getDepartments() {
	socket.emit('departmentRequest',"");
}

function setOperators() {

}

function startMonitor() {
	clearall();
	$('#dlog').show();
	socket.emit('join room',MONITORROOM);
}

function stopMonitor() {
	socket.emit('leave room',MONITORROOM);
}

$(document).ready(function() {

	console.log("Console Ready");
	socket.emit('operatorRequest',"");
	clearall();
	socket.on('errorResponse', function(data) {
		clearall();
		$("#error").text(data);
	});
	socket.on('goodResponse', function(data){
		$("#message1").html(data);
	});
	// this returns an object of departments
	socket.on('departmentResponse',function(data){
		clearall();
		var str = "No of Depts: "+Object.keys(data).length;
		str += "<table><tr><td>DeptID</td><td>Name</td></tr>";
		for(var i in data)
		{
			str += "<tr><td>"+i+"</td>";
			str += "<td>"+data[i]+"</td>";
		}
		str += 	"</table>";
		$("#message1").html(str);
	});
	// this returns an object of operator objects
	socket.on('operatorResponse',function(dlist) {
		for(var i in dlist)
		{
			Operators[dlist[i].operatorID] = dlist[i].operatorName;
		}
		var str = "No of Operators: "+Object.keys(Operators).length;
		populateOperatorsSelect();
	});
	// this returns a message object
	socket.on('chatMessage',function(data) {
		var str = "\r\n";
		console.log("Message: "+data.text);
		str += "Chat id:"+data.chatID+"\r\n";
		str += "Name:"+data.name+"\r\n";
		str += "Date:"+data.date+"\r\n";
		str += "Text:"+data.text+"\r\n";
		$('#dlog').append(str);
		document.getElementById("dlog").scrollTop = document.getElementById("dlog").scrollHeight
	});
	socket.on('consoleLogs',function(data) {
		$('#dlog').append(data+"\r\n");
		document.getElementById("dlog").scrollTop = document.getElementById("dlog").scrollHeight
	});
});

function getSelected(opsel) {
	var opid = opsel.value();
	console.log("Operator selected: "+opid);
}
/*
$('#opform').submit(function(event) {
	event.preventDefault();
	initialiseValues();
	opid = $("#OpSelect option:selected").val();
});
*/
function clearall() {
	$('#chatform').hide();
	$('#dlog').hide();
	$('#error').text();
	$('#message1').html("");
	$('#message2').html("");
}

function populateOperatorsSelect() {
	var opselect = document.getElementById("OpSelect");
	var option;
	for(var i in Operators)
	{
		option = document.createElement("option");
		option.text = Operators[i];
		option.value = i;
		opselect.appendChild(option);
	}
}

function showOperators() {
	clearall();
	var str = "No of Operators: "+Object.keys(Operators).length;
	str += "<table><tr><td>OperatorID</td><td>Name</td></tr>";
	for(var i in Operators)
	{
		str += "<tr><td>"+i+"</td>";
		str += "<td>"+Operators[i]+"</td></tr>";
	}
	str += 	"</table>";
	$("#message1").html(str);
}
/*
 *	This function makes data (typically csv format) available for download
 *  using the DOM id "download" which should be labelled "download file"
 */
function prepareDownloadFile(data)
{
	var filedata = new Blob([data], {type: 'text/plain'});
	// If we are replacing a previously generated file we need to
	// manually revoke the object URL to avoid memory leaks.
	if (csvfile !== null)
	{
		window.URL.revokeObjectURL(csvfile);
	}

    csvfile = window.URL.createObjectURL(filedata);
	$("#message1").text("Snapshot exported "+ new Date().toUTCString());
	$('#download').attr("href",csvfile);
	$('#download').show(300);
}
