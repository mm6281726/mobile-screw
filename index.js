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

var samplerate = 44100;

var pathname = __dirname + "/app/tmp/";


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
  var audiofile = res.locals.filename+'.mp3';

  console.log("Stream in progress...");  
  
  ffmpeg()
    .input(ytdl.downloadFromInfo(res.locals.info, { filter: function(f) {
      return f.container === 'mp4' && !f.encoding; } }))
      .audioFilters(['asetrate=' + samplerate * res.locals.playbackrate])
      .format('mp3')
      .save(audiofile)
      .on('error', function(err) {
        callback(err, null);
      })
      .on('progress', function(progress) {
        process.stdout.cursorTo(0);
        process.stdout.clearLine(1);
        process.stdout.write(progress.timemark);
      }).on('end', function() {
        
        console.log("\nStream finished...");

        console.log("Downloading file " + audiofile + "...");

        res.download(audiofile, res.locals.info.title + ' (C & S).mp3', function(err){
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
      res.locals.filename = pathname+info.title+res.locals.requestId;

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