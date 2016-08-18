var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var port = process.env.PORT || 3000;
var cuid = require('cuid');

var path = require("path");
var mime = require('mime');

var async = require('async');
var fs = require('fs');
var ytdl = require('ytdl-core');

var ffmpeg = require('fluent-ffmpeg');


const pathname = __dirname + "/app/tmp/";
const samplerate = 44100;


app.use(express.static(__dirname + '/app'));
app.use('/js', express.static(__dirname + '/node_modules/bootstrap/dist/js')); // redirect bootstrap JS
app.use('/js', express.static(__dirname + '/node_modules/jquery/dist')); // redirect JS jQuery
app.use('/css', express.static(__dirname + '/node_modules/bootstrap/dist/css')); // redirect CSS bootstrap

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname + '/index.html'));
});

app.get('/upload', function (req, res) {
  try {
    fs.mkdirSync(pathname);
  } catch(e) {
    if ( e.code != 'EEXIST' ) throw e;
  }

  res.locals.requestId = cuid();  

  res.locals.url = req.query.url;
  res.locals.playbackrate = req.query.rpm

  console.log("Initiating socket connection...");
  console.time("execution");

  var listener = io.listen(server);

  listener.sockets.on('connection', function(socket) {

    console.log("Socket connected...");

    async.waterfall([
      async.apply(applyRes, res, socket),
      getTitle,
      convertYoutubeToMp3
    ], function (err, results) {
      if(err) {
        msg = err
        console.log(msg);
        socket.emit('update', { msg: msg });
      } else {
        msg = results
        console.log(msg);
        socket.emit('update', { msg: msg });
      }

      console.timeEnd("execution");
    });
  });
});

function convertYoutubeToMp3(res, socket, callback) {  

  msg = "Stream in progress..."
  console.log(msg);
  socket.emit('update', { msg: msg });

  var title = res.locals.info.title;
  var audiofile = pathname+title+res.locals.requestId+'.mp3';
  
  var playbackrate = res.locals.playbackrate;
  var totalTime = Math.floor(res.locals.info.length_seconds / playbackrate);

  console.log("Total Duration: " + totalTime + "s");

  ffmpeg()
    .input(ytdl.downloadFromInfo(res.locals.info, { filter: function(f) {
      return f.container === 'mp4' && !f.encoding; } }))
      .audioFilters(['asetrate=' + samplerate * playbackrate])
      .outputOptions(['-write_xing 0'])
      // .format('mp3')
      .save(audiofile)
      .on('error', function(err) {
        callback(err, null);
      })
      .on('progress', function(progress) {

        var currentProgress = new Date('1970-01-01T' + progress.timemark + 'Z').getTime() / 1000
        var percentProgress = Math.floor((currentProgress / totalTime) * 100)
        var msg = 'Percent Complete: ' + percentProgress + "%";
        console.log(msg);
        socket.emit('update', { msg: msg, progress: true });

      }).on('end', function() {
        
      msg = "Stream finished..."
      console.log(msg);
      socket.emit('update', { msg: msg });

      msg = "Downloading file " + title + " (C & S).mp3...";
      console.log(msg);
      socket.emit('update', { msg: msg });
        
      res.download(audiofile, title + ' (C & S).mp3', function(err){
        if(err){      
          callback("Sorry, there was an error.", null);
        }else{
          fs.unlink(audiofile);
          callback(null, "Done.");
        }
      });
    });
}

function getTitle(res, socket, callback) {
  var msg = "Processing Request ID: " + res.locals.requestId + "...";
  console.log(msg);
  socket.emit('update', { msg: "Processing request..." });

  ytdl.getInfo(res.locals.url, function(err, info) {
    if (err) {
      callback("Could not get title.", null);
    } else {
      res.locals.info = info;      

      msg = "Title: " + info.title
      console.log(msg);
      socket.emit('update', { msg: msg });

      callback(null, res, socket);
    }
  });
}

function applyRes(res, socket, callback){  
  callback(null, res, socket);
}

server.listen(port, function() {
  console.log("Running at Port " + port);
});