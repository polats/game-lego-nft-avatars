function asyncToBlob(canvas) {
  return new Promise(function(resolve) {
    canvas.toBlob(function(blob) {
      return resolve(blob);
    });
  });
}

function onload2promise(obj){
    return new Promise((resolve, reject) => {
        obj.onload = () => resolve(obj);
        obj.onerror = reject;
        obj.onprogress = function(x, y, z){
            console.log('progress', x, y, z);
        }
    });
}

// from https://stackoverflow.com/questions/14218607/javascript-loading-progress-of-an-image
function loadImage(imageUrl, onprogress) {
  return new Promise((resolve, reject) => {
    var xhr = new XMLHttpRequest();
    var notifiedNotComputable = false;

    xhr.open('GET', imageUrl, true);
    xhr.responseType = 'arraybuffer';

    xhr.onprogress = function(ev) {
      if (ev.lengthComputable) {
        onprogress(parseInt((ev.loaded / ev.total) * 100));
      } else {
        if (!notifiedNotComputable) {
          notifiedNotComputable = true;
          onprogress(-1);
        }
      }
    }

    xhr.onloadend = function() {
      if (!xhr.status.toString().match(/^2/)) {
        reject(xhr);
      } else {
        if (!notifiedNotComputable) {
          onprogress(100);
        }

        var options = {}
        var headers = xhr.getAllResponseHeaders();
        var m = headers.match(/^Content-Type\:\s*(.*?)$/mi);

        if (m && m[1]) {
          options.type = m[1];
        }

        var blob = new Blob([this.response], options);

        resolve(window.URL.createObjectURL(blob));
      }
    };

    xhr.send();
  });
}


function cloneCanvas(oldCanvas) {

    //create a new canvas
    const newCanvas = document.createElement('canvas');
    const context = newCanvas.getContext('2d');
    context.imageSmoothingEnabled = false;

    //set dimensions
    newCanvas.width = oldCanvas.width;
    newCanvas.height = oldCanvas.height;

    //apply the old canvas to the new one
    context.drawImage(oldCanvas, 0, 0);

    //return the new canvas
    return newCanvas;
}

function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

function _parse_xml(xml_string){
    // https://stackoverflow.com/questions/17604071/parse-xml-using-javascript
    let xmlDoc;
    if (window.DOMParser)
    {
        const parser = new DOMParser();
        xmlDoc = parser.parseFromString(xml_string, "text/xml");
    }
    else // Internet Explorer
    {
        xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
        xmlDoc.async = false;
        xmlDoc.loadXML(xml_string);
    }
    return xmlDoc;
}

function assign_uuids(xml_dom){
    /*
        Creates UUIDs in a xml string for layers/stacks where they do not exist
     */
    if(typeof xml_dom === 'string'){
        xml_dom = _parse_xml(xml_dom);
    }

    for(let _l of xml_dom.querySelectorAll('layer,stack')){
        if(_l.getAttribute('uuid') === null){
            _l.setAttribute('uuid', uuidv4());
        }
    }
    return xml_dom
}

export {
    asyncToBlob,
    onload2promise,
    cloneCanvas,
    uuidv4,
    assign_uuids,
    _parse_xml,
    loadImage
}

