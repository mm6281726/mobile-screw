// Imports
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

// temporary file for saving songs being processed
const pathname = __dirname + "/app/tmp/";
// standard samplerate for audio, can be modified because "config all the options"
const samplerate = 44100;

// set up for express
app.use(express.static(__dirname + '/app'));
app.use('/js', express.static(__dirname + '/node_modules/jquery/dist')); // redirect JS jQuery
app.use('/js', express.static(__dirname + '/node_modules/jquery-ui-dist')); // redirect JS jQuery-ui
app.use('/css', express.static(__dirname + '/node_modules/jquery-ui-dist')); // redirect CSS jQuery-ui
app.use('/js', express.static(__dirname + '/node_modules/bootstrap/dist/js')); // redirect bootstrap JS
app.use('/css', express.static(__dirname + '/node_modules/bootstrap/dist/css')); // redirect CSS bootstrap

// needed for getting params from POST request
app.use(bodyParser.urlencoded({ extended: true }));

// loads homepage
app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname + '/index.html'));
});

// begins the process of uploading and modifying audio
app.post('/upload', function (req, res) {

  // create the tmp directory if it does not exist
  try {
    fs.mkdirSync(pathname);
  } catch(e) {
    if ( e.code != 'EEXIST' ) throw e;
  }

  /** set up the session for audio processing **/

  // currently no use for this but its a unique process id
  res.locals.requestId = cuid();
  // save url string to session
  res.locals.url = req.body.url;
  // save playbackrate from slider to session
  res.locals.playbackrate = req.body.rpm

  console.log("Initiating...");

  // asynchronous waterfall that runs the meaty part of screw-mobile in order.
  // async.apply is used to send the response as a param so we have access to 
  // the session. Each function in the waterfall is ended with a callback
  // function. These look like so - callback(err, res). If there is an error
  // pass it in like callback("sample error message", null). If the function
  // is successful, it will look like callback(null, res).
  async.waterfall([
    async.apply(applyRes, res),
    getTitle,
    convertYoutubeToMp3
  ], function (err, results) {

    // when waterfall is complete, communicate error or success
    if(err) {
      communicate(err);        
    } else {
      communicate(results);
    }
  });
});

/********************************************************
 * The heavy-lifting function for screw-mobile. Downloads
 * the audio from a youtube video, sets the new 
 * samplerate per samplerate * web page slider, saves
 * the new audio track to user, then deletes the temp
 * file.
 * @param res is the response which contains the session
 * @param callback is the function that will be called
 * at the end of this function. It will either be a
 * success or an error message because this is the last
 * waterfall function
 **/
function convertYoutubeToMp3(res, callback) {  

  communicate("Stream in progress...");

  // name of youtube video
  var title = res.locals.info.title;
  // name of temp file we will be saving
  var audiofile = pathname+title+res.locals.requestId+'.mp3';
  
  // value of web page slider that was saved to session
  var playbackrate = res.locals.playbackrate;
  // used to calculate total progress
  var totalTime = Math.floor(res.locals.info.length_seconds / playbackrate);

  /********************************************************************************************************
   * line by line explanation:
   * ffmpeg - set up ffmpeg with a timeout after 30 seconds
   * input - what file to input to ffmpeg. It can accept a stream so plug in ytdl download stream directly.
   * The filter part of input is what strips away the video so we only get the audio
   * audioFilters - sets the sample rate which alters time & pitch
   * outputOptions - can't remember at the moment but it must be good
   * save - saves the audio file before the user decides to download it
   * on error - if an error happens during conversion, throw an error and stop
   * on progress - update the progress bar as progress happens
   * on end - successfully finished conversion and ready for download
   **/
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

          // Deletes temp file. I think it's here for a reason but we should be deleting the file whether
          // there is a success or not.
          fs.unlink(audiofile);
          callback(null, "Done.");
        }
      });
    });
}

/********************************************************
 * Gets metadata from youtube URL and saves to the 
 * session
 * @param res is the response which contains the session
 * @param callback is the next function in the waterfall 
 * that will be called with the params
 **/
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

/********************************************************
 * Allows async waterfall access to parameters/session
 * @param res is the response which contains the session
 * @param callback is the next function in the waterfall 
 * that will be called with the params
 **/
function applyRes(res, callback) {

  communicate("Processing request...");

  callback(null, res);
}

/********************************************************
 * Communicates update messages to webpage using socket.
 * Currently only updates the progress bar using the 
 * 'update' action.
 * @param msg is the message to be communicated to the 
 *            progress bar
 * @param progress is the percentage of completion for bar
 **/
function communicate(msg, progress = false) {
  console.log(msg);
  io.sockets.emit('update', { msg: msg, progress: progress });
}

// config server to listen to chosen port
server.listen(port, function() {
  console.log("Running at Port " + port);
});