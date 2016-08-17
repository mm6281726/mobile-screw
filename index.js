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
      convertYoutubeToMp4,
      convertMp4ToMp3,
      // convertYoutubeToMp3,
      download
    ], function (err, results) {
      if(err) {
        console.log(err);
      } else {
        console.log(results);
      }
    }
  );
});

function download(res, callback) {
  var videofile = res.locals.filename+'.mp4';
  var audiofile = res.locals.filename+'.mp3';

  console.log("Downloading file " + audiofile + "...");

  res.download(audiofile, res.locals.title + ' (C & S).mp3', function(err){
    if(err){      
      callback("Sorry, there was an error.", null);
    }else{
      fs.unlink(videofile);
      fs.unlink(audiofile);

      callback(null, "Done.");

    }
  });
}

function convertYoutubeToMp3(res, callback) {
  var videofile = res.locals.filename+'.mp4';
  var audiofile = res.locals.filename+'.mp3';

  console.log("Booting up stream...");

  var filestream;
  try {
    filestream = ytdl(res.locals.url, { filter: function(format) { return format.container === 'mp4';} })
                    .pipe(fs.createWriteStream(videofile));
  } catch (e) {
    callback(e, null);
    return;
  }

  console.log("Stream in progress...");  
  
  console.log("Begin command...");

  var command
  try {
    command = new ffmpeg(fs.createReadStream(videofile))
                  .audioCodec('libmp3lame')
                  .noVideo()
                  .audioFilters(['asetrate=' + samplerate * res.locals.playbackrate])
                  .format('mp3')
                  .save(fs.createWriteStream(audiofile));
  } catch (e) {
    callback(e, null);
    return;
  }

  console.log("Command in progress...");

  filestream.on('finish', function() {

    console.log("Stream finished...");

    command.on('end', function(stdout, stderr) {

      console.log("Command complete...");

      callback(null, res);
    });
  });    
}

function convertMp4ToMp3(res, callback) {
  var videofile = res.locals.filename+'.mp4';
  var audiofile = res.locals.filename+'.mp3';
  
  console.log("Begin command...");

  var command
  try {
    command = new ffmpeg(videofile)
                  .audioCodec('libmp3lame')
                  .noVideo()
                  .audioFilters(['asetrate=' + samplerate * res.locals.playbackrate])
                  .format('mp3')
                  .save(audiofile);
  } catch (e) {
    callback(e, null);
    return;
  }

  console.log("Command in progress...");

  command.on('end', function(stdout, stderr) {

    console.log("Command complete...");

    callback(null, res);
  });
}

function convertYoutubeToMp4(res, callback) {
  var videofile = res.locals.filename+'.mp4';

  console.log("Booting up stream...");
  
  var filestream;
  try {
    filestream = ytdl(res.locals.url, { filter: function(format) { return format.container === 'mp4';} })
                    .pipe(fs.createWriteStream(videofile));
  } catch (e) {
    callback(e, null);
    return;
  }

  console.log("Stream in progress...");

  filestream.on('finish', function() {

    console.log("Stream finished...");

    callback(null, res);
  });
}

function getTitle(res, callback) {
  
  console.log("Processing Request ID: "+res.locals.requestId+"...");

  ytdl.getInfo(res.locals.url, function(err, info) {
    if (err) {
      callback("Could not get title.", null);
    } else {
      res.locals.title = info.title;      
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