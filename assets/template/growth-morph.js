// Landmark-matched textured mesh. Every frame is derived from a seekable growth value.
window.GrowthMorph = class GrowthMorph {
  constructor(canvas, atlas, stages, landmarks, config) {
    this.canvas=canvas; this.stages=stages; this.landmarks=landmarks;this.config=config;this.n=stages.length;const cw=config.atlas.cellWidth,ch=config.atlas.cellHeight;
    const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,preserveDrawingBuffer:true});
    if(!gl) throw new Error('WebGL is required for the continuous specimen morph.');
    this.gl=gl;
    const shader=(kind,source)=>{const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
    const p=gl.createProgram();
    gl.attachShader(p,shader(gl.VERTEX_SHADER,`uniform vec2 uResolution;attribute vec2 aPosition;attribute vec2 aUvA;attribute vec2 aUvB;varying vec2 vA;varying vec2 vB;void main(){gl_Position=vec4(aPosition.x/uResolution.x*2.0-1.0,1.0-aPosition.y/uResolution.y*2.0,0.0,1.0);vA=aUvA;vB=aUvB;}`));
    gl.attachShader(p,shader(gl.FRAGMENT_SHADER,`precision highp float;uniform sampler2D uA;uniform sampler2D uB;uniform sampler2D uDa;uniform sampler2D uDb;uniform float uMix;uniform float uEdge;varying vec2 vA;varying vec2 vB;void main(){vec3 a=texture2D(uA,vA).rgb;vec3 b=texture2D(uB,vB).rgb;float da=(texture2D(uDa,vA).r-.5)*64.0;float db=(texture2D(uDb,vB).r-.5)*64.0;float coverage=smoothstep(-uEdge,uEdge,mix(da,db,uMix));gl_FragColor=vec4(mix(a,b,uMix)*coverage,coverage);}`));
    gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));gl.useProgram(p);this.program=p;
    this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    for(const [name,offset] of [['aPosition',0],['aUvA',8],['aUvB',16]]){const loc=gl.getAttribLocation(p,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,24,offset);}
    gl.uniform1i(gl.getUniformLocation(p,'uA'),0);gl.uniform1i(gl.getUniformLocation(p,'uB'),1);gl.uniform1i(gl.getUniformLocation(p,'uDa'),2);gl.uniform1i(gl.getUniformLocation(p,'uDb'),3);this.mixLoc=gl.getUniformLocation(p,'uMix');gl.uniform2f(gl.getUniformLocation(p,'uResolution'),canvas.width,canvas.height);gl.uniform1f(gl.getUniformLocation(p,'uEdge'),config.morph.edgeSoftness);
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);
    this.textures=stages.map((s,i)=>{
      const crop=document.createElement('canvas');crop.width=cw;crop.height=ch;
      const ctx=crop.getContext('2d'),cell=s.cell;ctx.drawImage(atlas,(cell%config.atlas.columns)*cw,Math.floor(cell/config.atlas.columns)*ch,cw,ch,0,0,cw,ch);
      if(s.visibleRect){const [x0,y0,x1,y1]=s.visibleRect;ctx.clearRect(0,0,cw,y0);ctx.clearRect(0,y1,cw,ch-y1);ctx.clearRect(0,0,x0,ch);ctx.clearRect(x1,0,cw-x1,ch);}
      const pixels=ctx.getImageData(0,0,cw,ch).data;
      const prepared=GrowthMorph.distanceTextures(pixels,cw,ch,config.morph.alphaThreshold);
      const upload=bytes=>{const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,cw,ch,0,gl.RGBA,gl.UNSIGNED_BYTE,bytes);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return tex;};
      return {color:upload(prepared.color),distance:upload(prepared.distance)};
    });
    const mean=landmarks[0].map((_,i)=>[landmarks.reduce((a,p)=>a+p[i][0],0)/stages.length,landmarks.reduce((a,p)=>a+p[i][1],0)/stages.length]);
    this.triangles=GrowthMorph.triangulate(mean);
    this.poses=landmarks.map((points,i)=>points.map(p=>this.world(i,p)));
  }
  world(i,p){const s=this.stages[i],k=s.scale*this.config.hero.pixelsPerUnit,a=this.config.hero.anchor;return [a[0]+(p[0]-s.anchor[0])*k,a[1]+(p[1]-s.anchor[1])*k];}
  static catmull(a,b,c,d,t){const t2=t*t,t3=t2*t;return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3);}
  coordinate(g,index){const i=Math.min(this.n-2,Math.floor(g)),t=g-i;return [0,1].map(k=>GrowthMorph.catmull(this.poses[Math.max(0,i-1)][index][k],this.poses[i][index][k],this.poses[i+1][index][k],this.poses[Math.min(this.n-1,i+2)][index][k],t));}
  draw(g){
    g=Math.min(this.n-1,Math.max(0,g));const i=Math.min(this.n-2,Math.floor(g)),t=g-i,w=t*t*t*(t*(t*6-15)+10),gl=this.gl;
    const data=[];
    for(const tri of this.triangles)for(const j of tri){const p=this.coordinate(g,j),a=this.landmarks[i][j],b=this.landmarks[i+1][j];data.push(p[0],p[1],a[0]/this.config.atlas.cellWidth,a[1]/this.config.atlas.cellHeight,b[0]/this.config.atlas.cellWidth,b[1]/this.config.atlas.cellHeight);}
    gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.textures[i].color);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.textures[i+1].color);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.textures[i].distance);gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.textures[i+1].distance);gl.uniform1f(this.mixLoc,w);gl.drawArrays(gl.TRIANGLES,0,data.length/6);
  }
  static distanceTextures(pixels,w,h,alphaThreshold){
    const n=w*h,inside=new Uint8Array(n);
    for(let i=0;i<n;i++)inside[i]=pixels[i*4+3]>=alphaThreshold?1:0;
    if(!inside.some(v=>v===1))throw new Error('Atlas cell has no foreground above alphaThreshold.');
    const distanceTo=value=>{
      const d=new Float32Array(n),nearest=new Int32Array(n);
      for(let i=0;i<n;i++){d[i]=inside[i]===value?0:1e6;nearest[i]=inside[i]===value?i:-1;}
      const relax=(i,j,c)=>{if(j>=0&&j<n&&d[j]+c<d[i]){d[i]=d[j]+c;nearest[i]=nearest[j];}};
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(x)relax(i,i-1,1);if(y)relax(i,i-w,1);if(x&&y)relax(i,i-w-1,1.414214);if(x<w-1&&y)relax(i,i-w+1,1.414214);}
      for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;if(x<w-1)relax(i,i+1,1);if(y<h-1)relax(i,i+w,1);if(x<w-1&&y<h-1)relax(i,i+w+1,1.414214);if(x&&y<h-1)relax(i,i+w-1,1.414214);}
      return {d,nearest};
    };
    const toInside=distanceTo(1),toOutside=distanceTo(0),color=new Uint8Array(n*4),distance=new Uint8Array(n*4);
    for(let i=0;i<n;i++){
      const j=(inside[i]?i:Math.max(0,toInside.nearest[i]))*4,k=i*4;
      color[k]=pixels[j];color[k+1]=pixels[j+1];color[k+2]=pixels[j+2];color[k+3]=255;
      const sd=toOutside.d[i]-toInside.d[i],v=Math.round(Math.max(0,Math.min(1,.5+sd/64))*255);
      distance[k]=v;distance[k+1]=v;distance[k+2]=v;distance[k+3]=255;
    }
    return {color,distance};
  }
  static triangulate(points){
    const n=points.length,m=Math.max(...points.flat().map(Math.abs),1)*16,pts=points.concat([[-m,-m],[3*m,-m],[-m,3*m]]);let tris=[[n,n+1,n+2]];
    const contains=(tri,p)=>{const [a,b,c]=tri.map(i=>pts[i]);const ax=a[0]-p[0],ay=a[1]-p[1],bx=b[0]-p[0],by=b[1]-p[1],cx=c[0]-p[0],cy=c[1]-p[1];const det=(ax*ax+ay*ay)*(bx*cy-cx*by)-(bx*bx+by*by)*(ax*cy-cx*ay)+(cx*cx+cy*cy)*(ax*by-bx*ay);const orient=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);return orient>0?det>1e-7:det< -1e-7;};
    for(let i=0;i<n;i++){const bad=tris.filter(t=>contains(t,pts[i]));const edges=new Map();for(const tri of bad)for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);}tris=tris.filter(t=>!bad.includes(t));for(const e of edges.values())tris.push([e[0],e[1],i]);}
    return tris.filter(t=>t.every(i=>i<n));
  }
};
