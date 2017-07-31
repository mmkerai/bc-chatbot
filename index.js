var socket = io.connect();
const MONITORROOM = "monitor_room";		// socket room name for monitoring this service

function getDepartments() {
	socket.emit('departmentRequest',"");
}

function getOperators() {
	socket.emit('operatorRequest',"");
}

function startBot() {
	clearall();
	$('#dlog').show();
	socket.emit('join room',MONITORROOM);
}

function stopBot() {
	socket.emit('leave room',MONITORROOM);
}

$(document).ready(function() {

	console.log("Console Ready");
	clearall();
	socket.on('errorResponse', function(data){
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
	socket.on('operatorResponse',function(data){
		clearall();
		var str = "No of Operators: "+Object.keys(data).length;
		str += "<table><tr><td>OperatorID</td><td>Name</td><td>Chat Messages</td></tr>";
		for(var i in data)
		{
			str += "<tr><td>"+data[i].operatorID+"</td>";
			str += "<td>"+data[i].operatorName+"</td>";
			str += "<td>"+data[i].chatMessages+"</td>";
		}
		str += 	"</table>";
		$("#message1").html(str);
	});
	// this returns a message object
	socket.on('chatMessage',function(data){
		var str = "\r\n";
		console.log("Message: "+data.text);
		str += "Chat id:"+data.chatID+"\r\n";
		str += "Name:"+data.name+"\r\n";
		str += "Date:"+data.date+"\r\n";
		str += "Text:"+data.text+"\r\n";
		$('#dlog').append(str);
		document.getElementById("dlog").scrollTop = document.getElementById("dlog").scrollHeight
	});
	socket.on('consoleLogs',function(data){
		$('#dlog').append(data+"\r\n");
		document.getElementById("dlog").scrollTop = document.getElementById("dlog").scrollHeight
	});
});

function clearall() {
	$('#chatform').hide();
	$('#dlog').hide();
	$('#error').text();
	$('#message1').html("");
	$('#message2').html("");
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
