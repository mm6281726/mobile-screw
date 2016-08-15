var express = require('express');
var app = express();
var server = require('http').Server(app);
var port = process.env.PORT || 3000;

var path = require("path");
var mime = require('mime');

var fs = require('fs');
var ytdl = require('ytdl-core');

var ffmpeg = require('fluent-ffmpeg');

var samplerate = 44100;

var id = 0;

app.use(express.static(__dirname + '/public'));

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname + '/index.html'));
});

app.get('/upload', function (req, res) {
  var requestId = id;
  id++;

  console.log("Processing Request #"+requestId+"...");  

  var playbackrate = req.query.rpm
  var url = req.query.url;

  var title;
  ytdl.getInfo(url, function(err, info) {
    title = info.title;

    console.log("Title:" + title)

    var videofile = __dirname + '/public/tmp/'+title+requestId+'.mp4';
    var audiofile = __dirname + '/public/tmp/'+title+requestId+'.mp3';
    var filestream;

    console.log("Booting up stream...");

    try {
      filestream = ytdl(url, { filter: function(format) { return format.container === 'mp4';} })
                    .pipe(fs.createWriteStream(videofile));
    } catch (exception) {
      res.status(500).send(exception);
    }

    var command
    filestream.on('finish', function() {

      console.log("Stream finished...");
      console.log("Begin command...");

      command = new ffmpeg(__dirname + '/public/tmp/'+title+requestId+'.mp4')
                    .audioCodec('libmp3lame')
                    .noVideo()
                    .audioFilters(['asetrate=' + samplerate * playbackrate])
                    .format('mp3')
                    .save(__dirname + '/public/tmp/'+title+requestId+'.mp3');
      
      command.on('end', function(stdout, stderr){

        console.log("Command complete...");
        console.log("Downloading file...");

        res.download(audiofile, function(err){
          if(err){
            console.log("Sorry, there was an error.");
          }else{
            fs.unlink(videofile);
            fs.unlink(audiofile);

            console.log("Done.");          
          }
        });      
      });

      console.log("Command in progress...");
    });

    console.log("Stream in progress...");

  });
});

server.listen(port, function() {
  console.log("Running at Port " + port);
})