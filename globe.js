/**
 * dat.globe Javascript WebGL Globe Toolkit
 * http://dataarts.github.com/dat.globe
 *
 * Copyright 2011 Data Arts Team, Google Creative Lab
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */


var DAT = DAT || {};

DAT.Globe = function(container, colorFn) {

  colorFn = colorFn || function(x) {
    var c = new THREE.Color();
    c.setHSV(  x/(x+1), 1.0, 1.0 );
    return c;
  };

  var Shaders = {
    'earth' : {
      uniforms: {
        'texture': { type: 't', value: 0, texture: null }
      },
      vertexShader: [
        'varying vec3 vNormal;',
        'varying vec2 vUv;',
        'void main() {',
          'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
          'vNormal = normalize( normalMatrix * normal );',
          'vUv = uv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D texture;',
        'varying vec3 vNormal;',
        'varying vec2 vUv;',
        'void main() {',
          'vec3 diffuse = texture2D( texture, vUv ).xyz;',
          'float intensity = 1.05 - dot( vNormal, vec3( 0.0, 0.0, 1.0 ) );',
          'vec3 atmosphere = vec3( 1.0, 1.0, 1.0 ) * pow( intensity, 3.0 );',
          'gl_FragColor = vec4( diffuse + atmosphere, 1.0 );',
        '}'
      ].join('\n')
    },
    'atmosphere' : {
      uniforms: {},
      vertexShader: [
        'varying vec3 vNormal;',
        'void main() {',
          'vNormal = normalize( normalMatrix * normal );',
          'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vNormal;',
        'void main() {',
          'float intensity = pow( 0.8 - dot( vNormal, vec3( 0, 0, 1.0 ) ), 12.0 );',
          'gl_FragColor = vec4( 1.0, 1.0, 1.0, 1.0 ) * intensity;',
        '}'
      ].join('\n')
    }
  };

  var camera, scene, sceneAtmosphere, renderer, w, h;
  var vector, mesh, atmosphere, point;

  detailMode = false;

  var overRenderer;

  var imgDir = '';

  var curZoomSpeed = 0;
  var zoomSpeed = 50;

  var mouse = { x: 0, y: 0 }, mouseOnDown = { x: 0, y: 0 };
  var mouseOnDoubleClick = { x:0, y:0};
  var mouseOnOver = {x:0, y:0};

  var rotation = { x: 0, y: 0 },
      target = { x: Math.PI*3/2, y: Math.PI / 6.0 },
      targetOnDown = { x: 0, y: 0 };

  var distance = 100000, distanceTarget = 100000;
  var padding = 40;
  var PI_HALF = Math.PI / 2;

  var w = container.offsetWidth || window.innerWidth;
  var h = container.offsetHeight || window.innerHeight;
  
  var zoomCount = 0;
  var centrex = 200;
  var centrey = 40;
  var radius = 30;

  var doubleClickZooming = false;
  //initialise:

  var uniforms; 

  function init() {

    container.style.color = '#fff';
    container.style.font = '13px/20px Arial, sans-serif';

    var shader,  material;
    //var uniforms;

    //w = container.offsetWidth || window.innerWidth;
    //h = container.offsetHeight || window.innerHeight;

    camera = new THREE.Camera(
        30, w / h, 1, 10000);
    camera.position.z = distance;

    vector = new THREE.Vector3();

    scene = new THREE.Scene();
    sceneAtmosphere = new THREE.Scene();
    
    
    var geometry = new THREE.Sphere(centrex, centrey , radius);

    shader = Shaders['earth'];
    uniforms = THREE.UniformsUtils.clone(shader.uniforms);

    uniforms['texture'].texture = THREE.ImageUtils.loadTexture(imgDir+'world' +
        '.jpg');

    material = new THREE.MeshShaderMaterial({

          uniforms: uniforms,
          vertexShader: shader.vertexShader,
          fragmentShader: shader.fragmentShader

        });

    mesh = new THREE.Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    scene.addObject(mesh);

    shader = Shaders['atmosphere'];
    uniforms = THREE.UniformsUtils.clone(shader.uniforms);

    material = new THREE.MeshShaderMaterial({

          uniforms: uniforms,
          vertexShader: shader.vertexShader,
          fragmentShader: shader.fragmentShader

        });

    mesh = new THREE.Mesh(geometry, material);
    mesh.scale.x = mesh.scale.y = mesh.scale.z = 1.1;
    mesh.flipSided = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    sceneAtmosphere.addObject(mesh);

    geometry = new THREE.Cube(0.75, 0.75, 1, 1, 1, 1, null, false, { px: true,
          nx: true, py: true, ny: true, pz: false, nz: true});

    for (var i = 0; i < geometry.vertices.length; i++) {

      var vertex = geometry.vertices[i];
      vertex.position.z += 0.5;

    }

    point = new THREE.Mesh(geometry);

    renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.autoClear = false;
    renderer.setClearColorHex(0x000000, 0.0);
    renderer.setSize(w, h);

    renderer.domElement.style.position = 'absolute';

    container.appendChild(renderer.domElement);

    container.addEventListener('mousedown', onMouseDown, false);

    container.addEventListener('mousewheel', onMouseWheel, false);

    container.addEventListener('dblclick', onDoubleClick, false);


    document.addEventListener('keydown', onDocumentKeyDown, false);

    window.addEventListener('resize', onWindowResize, false);

    container.addEventListener('mouseover', function()
      {
        overRenderer = true;
      }, false);
      
    container.addEventListener('mouseout', function() {
      overRenderer = false;

    }, false);

  }


  addData = function(data, opts) {
    var lat, lng, size, color, i, step, colorFnWrapper;

    opts.animated = opts.animated || false;
    this.is_animated = opts.animated;
    opts.format = opts.format || 'magnitude'; // other option is 'legend'
    console.log(opts.format);
    if (opts.format === 'magnitude') {
      step = 3;
      colorFnWrapper = function(data, i) { return colorFn(data[i+2]); }
    } else if (opts.format === 'legend') {
      step = 4;
      colorFnWrapper = function(data, i) { return colorFn(data[i+3]); }
    } else {
      throw('error: format not supported: '+opts.format);
    }

    if (opts.animated) {
      if (this._baseGeometry === undefined) {
        this._baseGeometry = new THREE.Geometry();
        for (i = 0; i < data.length; i += step) {
          lat = data[i];
          lng = data[i + 1];
//        size = data[i + 2];
          color = colorFnWrapper(data,i);
          size = 0;
          addPoint(lat, lng, size, color, this._baseGeometry);
        }
      }
      if(this._morphTargetId === undefined) {
        this._morphTargetId = 0;
      } else {
        this._morphTargetId += 1;
      }
      opts.name = opts.name || 'morphTarget'+this._morphTargetId;
    }
    var subgeo = new THREE.Geometry();
    for (i = 0; i < data.length; i += step) {
      lat = data[i];
      lng = data[i + 1];
      color = colorFnWrapper(data,i);
      size = data[i + 2];
      if(size > 3 )
      {
        size = size/600 + 4;
      }
      else
      {
        size = size*(4/3);
      }
      
      addPoint(lat, lng, size, color, subgeo);
    }
    if (opts.animated) {
      this._baseGeometry.morphTargets.push({'name': opts.name, vertices: subgeo.vertices});
    } else {
      this._baseGeometry = subgeo;
    }
  }

  
  function createPoints() {
    if (this._baseGeometry !== undefined) {
      if (this.is_animated === false) {
        this.points = new THREE.Mesh(this._baseGeometry, new THREE.MeshBasicMaterial({
              color: 0xffffff,
              vertexColors: THREE.FaceColors,
              morphTargets: false
            }));
      } else {
        if (this._baseGeometry.morphTargets.length < 8) {
          console.log('t l',this._baseGeometry.morphTargets.length);
          var padding = 8-this._baseGeometry.morphTargets.length;
          console.log('padding', padding);
          for(var i=0; i<=padding; i++) {
            console.log('padding',i);
            this._baseGeometry.morphTargets.push({'name': 'morphPadding'+i, vertices: this._baseGeometry.vertices});
          }
        }
        this.points = new THREE.Mesh(this._baseGeometry, new THREE.MeshBasicMaterial({
              color: 0xffffff,
              vertexColors: THREE.FaceColors,
              morphTargets: true
            }));
      }
      scene.addObject(this.points);
    }
  }

   
  function addPoint(lat, lng, size, color, subgeo) {
    var phi = (90 - lat) * Math.PI / 180;
    var theta = (180 - lng) * Math.PI / 180;



    point.position.x = 200 * Math.sin(phi) * Math.cos(theta);
    point.position.y = 200 * Math.cos(phi);
    point.position.z = 200 * Math.sin(phi) * Math.sin(theta);

    // HERE I CHANGED THE 200 to a 400 TO SEE IF SIZE INCREASES

    point.lookAt(mesh.position);

    point.scale.z = -size;
    point.updateMatrix();

    var i;
    for (i = 0; i < point.geometry.faces.length; i++) {

      point.geometry.faces[i].color = color;

    }

    GeometryUtils.merge(subgeo, point);
  }

  function onMouseDown(event) {
    event.preventDefault();

    container.addEventListener('mousemove', onMouseMove, false);
    container.addEventListener('mouseup', onMouseUp, false);
    container.addEventListener('mouseout', onMouseOut, false);

    mouseOnDown.x = - event.clientX;
    mouseOnDown.y = event.clientY;

    targetOnDown.x = target.x;
    targetOnDown.y = target.y;

    container.style.cursor = 'move';
  }

  function onMouseWheel(event) {
    event.preventDefault();
    if (overRenderer) {
      zoom(event.wheelDeltaY * 0.3);
    }
    return false;
  }

  var geocoder;
  var map;
  //var infowindow = new google.maps.InfoWindow();
  var marker;
  
  //function initialize() {
  //  }

  //function codeLatLng() {
  //}




  
  BITS = [16, 8, 4, 2, 1];

  BASE32 =  "0123456789bcdefghjkmnpqrstuvwxyz";
  NEIGHBORS = { 
              right  : { even :  "bc01fg45238967deuvhjyznpkmstqrwx" },
              left   : { even :  "238967debc01fg45kmstqrwxuvhjyznp" },
              top    : { even :  "p0r21436x8zb9dcf5h7kjnmqesgutwvy" },
              bottom : { even :  "14365h7k9dcfesgujnmqp0r2twvyx8zb" } };
  BORDERS   = { 
              right  : { even : "bcfguvyz" },
              left   : { even : "0145hjnp" },
              top    : { even : "prxz" },
              bottom : { even : "028b" } };

  NEIGHBORS.bottom.odd = NEIGHBORS.left.even;
  NEIGHBORS.top.odd = NEIGHBORS.right.even;
  NEIGHBORS.left.odd = NEIGHBORS.bottom.even;
  NEIGHBORS.right.odd = NEIGHBORS.top.even;

  BORDERS.bottom.odd = BORDERS.left.even;
  BORDERS.top.odd = BORDERS.right.even;
  BORDERS.left.odd = BORDERS.bottom.even;
  BORDERS.right.odd = BORDERS.top.even;

  function refine_interval(interval, cd, mask) 
  {
    if (cd&mask)
      interval[0] = (interval[0] + interval[1])/2;
    else
      interval[1] = (interval[0] + interval[1])/2;
  }

  function calculateAdjacent(srcHash, dir) 
  {
    srcHash = srcHash.toLowerCase();
    var lastChr = srcHash.charAt(srcHash.length-1);
    var type = (srcHash.length % 2) ? 'odd' : 'even';
    var base = srcHash.substring(0,srcHash.length-1);
    if (BORDERS[dir][type].indexOf(lastChr)!=-1)
      base = calculateAdjacent(base, dir);
    return base + BASE32[NEIGHBORS[dir][type].indexOf(lastChr)];
  }

  function decodeGeoHash(geohash) 
  {
    var is_even = 1;
    var lat = []; var lon = [];
    lat[0] = -90.0;  lat[1] = 90.0;
    lon[0] = -180.0; lon[1] = 180.0;
    lat_err = 90.0;  lon_err = 180.0;

    for (i=0; i<geohash.length; i++) {
      c = geohash[i];
      cd = BASE32.indexOf(c);
      for (j=0; j<5; j++) {
        mask = BITS[j];
        if (is_even) {
          lon_err /= 2;
          refine_interval(lon, cd, mask);
        } else {
          lat_err /= 2;
          refine_interval(lat, cd, mask);
        }
        is_even = !is_even;
      }
    }
    lat[2] = (lat[0] + lat[1])/2;
    lon[2] = (lon[0] + lon[1])/2;

    return { latitude: lat, longitude: lon};
  }

  function encodeGeoHash(latitude, longitude) 
  {
    var is_even=1;
    var i=0;
    var lat = []; var lon = [];
    var bit=0;
    var ch=0;
    var precision = 12;
    geohash = "";

    lat[0] = -90.0;  lat[1] = 90.0;
    lon[0] = -180.0; lon[1] = 180.0;

    while (geohash.length < precision) {
      if (is_even) {
        mid = (lon[0] + lon[1]) / 2;
        if (longitude > mid) {
          ch |= BITS[bit];
          lon[0] = mid;
        } else
        lon[1] = mid;
      } else {
        mid = (lat[0] + lat[1]) / 2;
        if (latitude > mid) {
          ch |= BITS[bit];
          lat[0] = mid;
        } else
        lat[1] = mid;
      }

      is_even = !is_even;
      if (bit < 4)
        bit++;
      else {
        geohash += BASE32[ch];
        bit = 0;
        ch = 0;
      }
    }
    return geohash;
  }



  function onDoubleClick(event)
  {
    overRenderer = true;
    if(detailMode == true)
    {
      event.preventDefault();
      //mouseOnOver.x = - event.clientX;
      //mouseOnOver.y = event.clientY;

      var canvas = renderer.domElement;
      var vector = new THREE.Vector3( ( (event.offsetX) / canvas.width ) * 2 - 1, - ( (event.offsetY) / canvas.height) * 2  + 1, 0.5 );

      var proj = new THREE.Projector();
      proj.unprojectVector( vector, camera );

      var ray = new THREE.Ray(camera.position, vector.subSelf(camera.position).normalize());

      var intersects = ray.intersectObject(mesh);

      if (intersects.length > 0) 
      {

            object = intersects[0];

            r = object.object.boundRadius;
            x = object.point.x;
            y = object.point.y;
            z = object.point.z;



            latover = 90 - ((Math.acos(y / r)) * 180 / Math.PI);
            lonover =  ((270 + (Math.atan2(x, z)) * 180 / Math.PI) % 360) - 180;

            //- ((Math.atan2(z,x)) * 180 / Math.PI);

            // ((Math.atan(z / x)) * 180 / Math.PI) -180;
            // 
            //if(lonover>-180) lonover = lonover + 360;
            latover =  - Math.round(latover * 100000) / 100000;
            lonover = Math.round(lonover * 100000) / 100000;

            /*
            Once I have the correct latover and lonover values
            all I need to do is ---  
            Idea #1)get something to pop up at that place, with left, top edge at that point (main city point) 
            For the details, what I need to do is, lookup the json file for the thing and sum up values of 
            number of connections within a certain bounding box of the main point in question.
            */
            var totalConnections = 0;
            for(var i = 0; i<data[0][1].length; i=i+3)
                  {
                    //compare the hashes of the point that you clicked on 
                    //as well as the
                    //latover = 37;
                    //lonover = 122;
                    var geohashPoint = encodeGeoHash(latover, lonover); 
                    var geohashSurrPoints = encodeGeoHash(data[0][1][i],data[0][1][i+1]);
                    if(geohashPoint.substring(0,3) == geohashSurrPoints.substring(0,3))
                    {
                      totalConnections = totalConnections + data[0][1][i+2];
                    }
                  }
            
            //At this point I have the total number of connections in my variable totalConnections
            console.log("total=" + totalConnections.toString() + ";lat="  + latover.toString() +';lon='+lonover.toString()+";");

            /*      
            geocoder = new google.maps.Geocoder();
            var latlng = new google.maps.LatLng(40.730885,-73.997383);
            var mapOptions = {
                zoom: 8,
                center: latlng
            }
            map = new google.maps.Map(document.getElementById("map-canvas"), mapOptions);

            var input = document.getElementById("latlng").value;
            var latlngStr = input.split(",",2);
            var lat = parseFloat(latlngStr[0]);
            var lng = parseFloat(latlngStr[1]);

            var latlng1 = new google.maps.LatLng(lat, lng);
            geocoder.geocode({'latLng': latlng1}, function(results, status) {
              if (status == google.maps.GeocoderStatus.OK) {
                if (results[1]) {
                  map.setZoom(11);
                  marker = new google.maps.Marker({
                    position: latlng,
                    map: map
                  });
                  infowindow.setContent(results[1].formatted_address);
                  infowindow.open(map, marker);
                }
              } else {
                alert("Geocoder failed due to: " + status);
              }
            });
            */

            /*
            Idea #2)get it to connect to a 2D map, and then have the required details there. 
            */
            

      }


    }

  }

  /*
  function onDoubleClick(event){

    event.preventDefault();
    doubleClickZooming = true;
    zoom(150);

    //<img src="http://maps.googleapis.com/maps/api/staticmap?center=-15.800513,-47.91378&zoom=11&size=200x200&sensor=false">

    
  }
  */





  function onMouseMove(event) {
    mouse.x = - event.clientX;
    mouse.y = event.clientY;

    var zoomDamp = distance/1000;

    target.x = targetOnDown.x + (mouse.x - mouseOnDown.x) * 0.005 * zoomDamp;
    target.y = targetOnDown.y + (mouse.y - mouseOnDown.y) * 0.005 * zoomDamp;

    target.y = target.y > PI_HALF ? PI_HALF : target.y;
    target.y = target.y < - PI_HALF ? - PI_HALF : target.y;
  }

  function onMouseUp(event) {
    container.removeEventListener('mousemove', onMouseMove, false);
    container.removeEventListener('mouseup', onMouseUp, false);
    container.removeEventListener('mouseout', onMouseOut, false);
    container.style.cursor = 'auto';
  }

  function onMouseOut(event) {
    container.removeEventListener('mousemove', onMouseMove, false);
    container.removeEventListener('mouseup', onMouseUp, false);
    container.removeEventListener('mouseout', onMouseOut, false);
  }


  function onDocumentKeyDown(event) {
    switch (event.keyCode) {
      case 38:
        zoom(100);
        event.preventDefault();
        break;
      case 40:
        zoom(-100);delta
        event.preventDefault();
        break;
    }
  }

  function onWindowResize( event ) {
    console.log('resize');
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
  }

  function zoom(delta) {

    if(doubleClickZooming==false)
    {
      distanceTarget -= delta;
      distanceTarget = distanceTarget > 1000 ? 1000 : distanceTarget;
      deltaistanceTarget = distanceTarget < 350 ? 350 : distanceTarget;
    }
    
    else
    {

      distanceTarget -= delta;
      distanceTarget = distanceTarget > 1000 ? 1000 : distanceTarget;
      deltaistanceTarget = distanceTarget < 350 ? 350 : distanceTarget;
      zoomCount+=1;
      
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    render();
  }

  function render() {
    zoom(curZoomSpeed);
    //Get's called 60 times a second. like timerfired

    rotation.x += (target.x - rotation.x) * 0.1;
    rotation.y += (target.y - rotation.y) * 0.1;
    distance += (distanceTarget - distance) * 0.3;

    camera.position.x = distance * Math.sin(rotation.x) * Math.cos(rotation.y);
    camera.position.y = distance * Math.sin(rotation.y);
    camera.position.z = distance * Math.cos(rotation.x) * Math.cos(rotation.y);

    vector.copy(camera.position);

    renderer.clear();

    renderer.render(scene, camera);
    renderer.render(sceneAtmosphere, camera);

  }

  init();
  this.animate = animate;


  this.__defineGetter__('time', function() {
    return this._time || 0;
  });

  this.__defineSetter__('time', function(t) {
    var validMorphs = [];
    var morphDict = this.points.morphTargetDictionary;
    for(var k in morphDict) {
      if(k.indexOf('morphPadding') < 0) {
        validMorphs.push(morphDict[k]);
      }
    }
    validMorphs.sort();
    var l = validMorphs.length-1;
    var scaledt = t*l+1;
    var index = Math.floor(scaledt);
    for (i=0;i<validMorphs.length;i++) {
      this.points.morphTargetInfluences[validMorphs[i]] = 0;
    }
    var lastIndex = index - 1;
    var leftover = scaledt - index;
    if (lastIndex >= 0) {
      this.points.morphTargetInfluences[lastIndex] = 1 - leftover;
    }
    this.points.morphTargetInfluences[index] = leftover;
    this._time = t;
  });

  this.addData = addData;
  this.createPoints = createPoints;
  this.renderer = renderer;
  this.scene = scene;

  return this;

};






















