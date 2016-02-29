/**
 * Taken, CommonJS-ified, and heavily modified from:
 * https://github.com/flyingsparx/NodeDirectUploader
 */

S3Upload.prototype.signingUrl = '/sign-s3';
S3Upload.prototype.fileElement = null;
S3Upload.prototype.files = null;

S3Upload.prototype.onFinishS3Put = function(signResult) {
    return console.log('base.onFinishS3Put()', signResult.publicUrl);
};

S3Upload.prototype.onProgress = function(percent, status) {
    return console.log('base.onProgress()', percent, status);
};

S3Upload.prototype.onError = function(status) {
    return console.log('base.onError()', status);
};

function S3Upload(options) {
    if (options == null) {
        options = {};
    }
    for (var option in options) {
        if (options.hasOwnProperty(option)) {
            this[option] = options[option];
        }
    }
    var files = this.fileElement ? this.fileElement.files : this.files || [];
    this.handleFileSelect(files);
}

S3Upload.prototype.handleFileSelect = function(files) {
    this.onProgress(0, 'Waiting');
    var result = [];
    for (var i=0; i < files.length; i++) {
        var f = files[i];
        result.push(this.uploadFile(f));
    }
    return result;
};

S3Upload.prototype.createCORSRequest = function(method, url) {
    var xhr = new XMLHttpRequest();

    if (xhr.withCredentials != null) {
        xhr.open(method, url, true);
    }
    else if (typeof XDomainRequest !== "undefined") {
        xhr = new XDomainRequest();
        xhr.open(method, url);
    }
    else {
        xhr = null;
    }
    return xhr;
};

S3Upload.prototype.executeOnSignedUrl = function(file, callback) {
    var xhr = new XMLHttpRequest();
    var fileName = file.name.replace(/\s+/g, "_");
    var queryString = '?objectName=' + fileName + '&contentType=' + file.type;
    if (this.signingUrlQueryParams) {
        var signingUrlQueryParams = this.signingUrlQueryParams;
        Object.keys(signingUrlQueryParams).forEach(function(key) {
            var val = signingUrlQueryParams[key];
            queryString += '&' + key + '=' + val;
        });
    }
    xhr.open('GET', this.signingUrl + queryString, true);
    if (this.signingUrlHeaders) {
        var signingUrlHeaders = this.signingUrlHeaders;
        Object.keys(signingUrlHeaders).forEach(function(key) {
            var val = signingUrlHeaders[key];
            xhr.setRequestHeader(key, val);
        });
    }
    xhr.overrideMimeType && xhr.overrideMimeType('text/plain; charset=x-user-defined');
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var result;
            try {
                result = JSON.parse(xhr.responseText);
            } catch (error) {
                this.onError('Invalid signing server response JSON: ' + xhr.responseText);
                return false;
            }
            return callback(result);
        } else if (xhr.readyState === 4 && xhr.status !== 200) {
            return this.onError('Could not contact request signing server. Status = ' + xhr.status);
        }
    }.bind(this);
    return xhr.send();
};

S3Upload.prototype.uploadToS3 = function(file, signResult) {
    var xhr = this.createCORSRequest('POST', signResult.signedUrl);
    if (!xhr) {
        this.onError('CORS not supported');
    } else {
        xhr.onload = function() {
            if (xhr.status === 200) {
                this.onProgress(100, 'Upload completed.');
                return this.onFinishS3Put(signResult);
            } else {
                return this.onError('Upload error: ' + xhr.status);
            }
        }.bind(this);
        xhr.onerror = function() {
            return this.onError('XHR error.');
        }.bind(this);
        xhr.upload.onprogress = function(e) {
            var percentLoaded;
            if (e.lengthComputable) {
                percentLoaded = Math.round((e.loaded / e.total) * 100);
                return this.onProgress(percentLoaded, percentLoaded === 100 ? 'Finalizing' : 'Uploading');
            }
        }.bind(this);
    }
    if (this.uploadRequestHeaders) {
        var uploadRequestHeaders = this.uploadRequestHeaders;
        Object.keys(uploadRequestHeaders).forEach(function(key) {
            var val = uploadRequestHeaders[key];
            xhr.setRequestHeader(key, val);
        });
    } else {
        xhr.setRequestHeader('x-amz-acl', 'public-read');
    }
    this.httprequest = xhr;
    var fileName = file.name.replace(/\s+/g, "_");
    var form = new FormData();
    form.append('key', signResult.key);
    form.append('acl', 'private');
    form.append('AWSAccessKeyId', signResult.accessKey);
    form.append('success_action_status', 200);
    form.append('Policy', signResult.policy);
    form.append('Signature', signResult.signature);
    form.append('file', file, fileName);
    return xhr.send(form);
};

S3Upload.prototype.uploadFile = function(file) {
    return this.executeOnSignedUrl(file, function(signResult) {
        return this.uploadToS3(file, signResult);
    }.bind(this));
};

S3Upload.prototype.abortUpload = function() {
    this.httprequest && this.httprequest.abort();
};


module.exports = S3Upload;
