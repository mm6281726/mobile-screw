var express = require('express');
var app = express();
var server = require('http').Server(app);
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

  async.waterfall([
      async.apply(applyRes, res),
      getTitle,
      convertYoutubeToMp3
    ], function (err, results) {
      if(err) {
        console.log(err);
      } else {
        console.log(results);
      }
    }
  );
});

function convertYoutubeToMp3(res, callback) {  

  console.log("Stream in progress...");

  var title = res.locals.info.title;
  var audiofile = pathname+title+res.locals.requestId+'.mp3';
  
  var playbackrate = res.locals.playbackrate;
  var totalTime = (res.locals.info.length_seconds / playbackrate);

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
        console.log(progress.timemark);
      }).on('end', function() {

        console.log("Stream finished...");
        console.log("Downloading file " + audiofile + "...");
        
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

function getTitle(res, callback) {
  
  console.log("Processing Request ID: "+res.locals.requestId+"...");

  ytdl.getInfo(res.locals.url, function(err, info) {
    if (err) {
      callback("Could not get title.", null);
    } else {
      res.locals.info = info;      

      console.log("Title:" + info.title);

      callback(null, res);
    }
  });
}

function applyRes(res, callback){  
  callback(null, res);
}

server.listen(port, function() {
  console.log("Running at Port " + port);
})