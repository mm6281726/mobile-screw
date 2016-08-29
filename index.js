var express = require('express');
var app = express();
var server = require('http').Server(app);
var bodyParser = require('body-parser');
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

app.use('/js', express.static(__dirname + '/node_modules/jquery/dist')); // redirect JS jQuery
app.use('/js', express.static(__dirname + '/node_modules/jquery-ui-dist')); // redirect JS jQuery-ui
app.use('/css', express.static(__dirname + '/node_modules/jquery-ui-dist')); // redirect CSS jQuery-ui
app.use('/js', express.static(__dirname + '/node_modules/bootstrap/dist/js')); // redirect bootstrap JS
app.use('/css', express.static(__dirname + '/node_modules/bootstrap/dist/css')); // redirect CSS bootstrap

app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname + '/index.html'));
});

app.post('/upload', function (req, res) {
  try {
    fs.mkdirSync(pathname);
  } catch(e) {
    if ( e.code != 'EEXIST' ) throw e;
  }

  res.locals.requestId = cuid();

  res.locals.url = req.body.url;
  res.locals.playbackrate = req.body.rpm

  console.log("Initiating...");

  async.waterfall([
    async.apply(applyRes, res),
    getTitle,
    convertYoutubeToMp3
  ], function (err, results) {
    if(err) {
      communicate(err);        
    } else {
      communicate(results);
    }
  });
});

function convertYoutubeToMp3(res, callback) {  

  communicate("Stream in progress...");

  var title = res.locals.info.title;
  var audiofile = pathname+title+res.locals.requestId+'.mp3';
  
  var playbackrate = res.locals.playbackrate;
  var totalTime = Math.floor(res.locals.info.length_seconds / playbackrate);

  ffmpeg({ timeout: 30 })
    .input(ytdl.downloadFromInfo(res.locals.info, { filter: function(f) {
      return f.container === 'mp4' && !f.encoding; } }))
    .audioFilters(['asetrate=' + samplerate * playbackrate])
    .outputOptions(['-write_xing 0'])
    .save(audiofile)
    .on('error', function(err) {
      callback(err.message, null);
    })
    .on('progress', function(progress) {

      var currentProgress = new Date('1970-01-01T' + progress.timemark + 'Z').getTime() / 1000
      var percentProgress = Math.floor((currentProgress / totalTime) * 100)
      communicate(percentProgress, true);

    }).on('end', function() {
        
      communicate("Stream finished...");
      communicate("Downloading file " + title + " (C & S).mp3...");
          
      res.download(audiofile, title + ' (C & S).mp3', function(err){
        if(err){
          console.log(err.message);
          callback("Sorry, there was an error.", null);            
        }else{
          fs.unlink(audiofile);
          callback(null, "Done.");
        }
      });
    });
}

function getTitle(res, callback) {
  ytdl.getInfo(res.locals.url, function(err, info) {
    if (err) {
      console.log(err.message);
      callback("Could not get title.", null);
    } else {
      res.locals.info = info;      

      communicate("Title: " + info.title);

      callback(null, res);
    }
  });
}

function applyRes(res, callback) {

  communicate("Processing request...");

  callback(null, res);
}

function communicate(msg, progress = false) {
  console.log(msg);
  io.sockets.emit('update', { msg: msg, progress: progress });
}

server.listen(port, function() {
  console.log("Running at Port " + port);
});