/**
 * @fileoverview RTCMediaHandler
 */

/* RTCMediaHandler
 * @class PeerConnection helper Class.
 * @param {SIP.RTCSession} session
 * @param {Object} [contraints]
 */
(function(SIP){

var RTCMediaHandler = function(session, constraints) {
  this.constraints = constraints || {};

  this.logger = session.ua.getLogger('sip.rtcsession.rtcmediahandler', session.id);
  this.session = session;
  this.localMedia = null;
  this.peerConnection = null;

  this.init(constraints);
};

RTCMediaHandler.prototype = {

  createOffer: function(onSuccess, onFailure) {
    var
      self = this,
      sent = false;

    this.onIceCompleted = function() {
      if (!sent) {
        sent = true;
        onSuccess(self.peerConnection.localDescription.sdp);
      }
    };

    this.peerConnection.createOffer(
      function(sessionDescription){
        self.setLocalDescription(
          sessionDescription,
          onFailure
        );
      },
      function(e) {
        self.logger.error('unable to create offer');
        self.logger.error(e);
        onFailure();
      }
    );

    if (this.peerConnection.iceGatheringState === 'complete' && this.peerConnection.iceConnectionState === 'connected') {
      window.setTimeout(function(){
        self.onIceCompleted();
      },0);
    }
  },

  createAnswer: function(onSuccess, onFailure) {
    var
      self = this,
      sent = false;

    this.onIceCompleted = function() {
      if (!sent) {
        sent = true;
        onSuccess(self.peerConnection.localDescription.sdp);
      }
    };

    this.peerConnection.createAnswer(
      function(sessionDescription){
        self.setLocalDescription(
          sessionDescription,
          onFailure
        );
      },
      function(e) {
        self.logger.error('unable to create answer');
        self.logger.error(e);
        onFailure();
      },
      this.constraints.RTCConstraints
    );

    if (this.peerConnection.iceGatheringState === 'complete' && this.peerConnection.iceConnectionState === 'connected') {
      window.setTimeout(function(){
        self.onIceCompleted();
      },0);
    }
  },

  setLocalDescription: function(sessionDescription, onFailure) {
    var self = this;

    this.peerConnection.setLocalDescription(
      sessionDescription,
      function(){},
      function(e) {
        self.logger.error('unable to set local description');
        self.logger.error(e);
        onFailure();
      }
    );
  },

  addStream: function(stream, onSuccess, onFailure, constraints) {
    try {
      this.peerConnection.addStream(stream, constraints);
    } catch(e) {
      this.logger.error('error adding stream');
      this.logger.error(e);
      onFailure();
      return;
    }

    onSuccess();
  },

  /**
  * peerConnection creation.
  * @param {Function} onSuccess Fired when there are no more ICE candidates
  */
  init: function(options) {
    options = options || {};

    var idx, length, server,
      self = this,
      servers = [],
      constraints = options.RTCConstraints || {},
      stun_servers = options.stun_servers || null,
      turn_servers = options.turn_servers || null,
      config = this.session.ua.configuration;

    if (!stun_servers) {
      stun_servers = config.stun_servers;
    }

    if(!turn_servers) {
      turn_servers = config.turn_servers;
    }

    servers.push({'url': stun_servers});

    length = turn_servers.length;
    for (idx = 0; idx < length; idx++) {
      server = turn_servers[idx];
      servers.push({
        'url': server.urls,
        'username': server.username,
        'credential': server.password
      });
    }

    this.peerConnection = new SIP.WebRTC.RTCPeerConnection({'iceServers': servers}, constraints);

    this.peerConnection.onaddstream = function(e) {
      self.logger.log('stream added: '+ e.stream.id);
    };

    this.peerConnection.onremovestream = function(e) {
      self.logger.log('stream removed: '+ e.stream.id);
    };

    this.peerConnection.onicecandidate = function(e) {
      if (e.candidate) {
        self.logger.log('ICE candidate received: '+ e.candidate.candidate);
      } else if (self.onIceCompleted !== undefined) {
        self.onIceCompleted();
      }
    };

    this.peerConnection.oniceconnectionstatechange = function(e) {
      self.logger.log('ICE connection state changed to "'+ this.iceConnectionState +'"');
      //Bria state changes are always connected -> disconnected -> connected, so session gets termi
     /* if (this.iceConnectionState === 'disconnected') {
        self.session.terminate({
          cause: SIP.C.causes.RTP_TIMEOUT,
          status_code: 200,
          reason_phrase: SIP.C.causes.RTP_TIMEOUT
        });
      } else*/ if (e.currentTarget.iceGatheringState === 'complete' && this.iceConnectionState !== 'closed') {
        self.onIceCompleted();
      }
    };

    this.peerConnection.onstatechange = function() {
      self.logger.log('PeerConnection state changed to "'+ this.readyState +'"');
    };
  },

  close: function() {
    this.logger.log('closing PeerConnection');
    if(this.peerConnection) {
      this.peerConnection.close();

      if(this.localMedia) {
        this.localMedia.stop();
      }
    }
  },

  /**
  * @param {Object} mediaConstraints
  * @param {Function} onSuccess
  * @param {Function} onFailure
  */
  getUserMedia: function(onSuccess, onFailure, mediaConstraints) {
    var self = this;

    this.logger.log('requesting access to local media');

    SIP.WebRTC.getUserMedia(mediaConstraints,
      function(stream) {
        self.logger.log('got local media stream');
        self.localMedia = stream;
        onSuccess(stream);
      },
      function(e) {
        self.logger.error('unable to get user media');
        self.logger.error(e);
        onFailure();
      }
    );
  },

  /**
  * Message reception.
  * @param {String} type
  * @param {String} sdp
  * @param {Function} onSuccess
  * @param {Function} onFailure
  */
  onMessage: function(type, body, onSuccess, onFailure) {
    this.peerConnection.setRemoteDescription(
      new SIP.WebRTC.RTCSessionDescription({type: type, sdp:body}),
      onSuccess,
      onFailure
    );
  }
};

// Return since it will be assigned to a variable.
return RTCMediaHandler;
}(SIP));