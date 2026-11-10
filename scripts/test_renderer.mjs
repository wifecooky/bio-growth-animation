#!/usr/bin/env node
// Offline behavior checks for stage counts, geometry scaling and silhouette fields.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=new URL('../assets/template/growth-morph.js',import.meta.url);
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(source,'utf8'),sandbox);
const Morph=sandbox.window.GrowthMorph;
const world=Morph.prototype.world.call({stages:[{anchor:[50,100],scale:.5}],config:{hero:{anchor:[500,900],pixelsPerUnit:2}}},0,[100,150]);
assert.equal(world[0],550);assert.equal(world[1],950);
for(const count of [2,3,7]){
 const model={n:count,poses:Array.from({length:count},(_,i)=>[[i*10,i*20]])};
 for(let i=0;i<count;i++){const p=Morph.prototype.coordinate.call(model,i,0);assert.equal(p[0],i*10);assert.equal(p[1],i*20);}
 for(let g=0;g<count-1;g+=.05)assert.ok(Morph.prototype.coordinate.call(model,g,0).every(Number.isFinite));
}
const mesh=Morph.triangulate([[0,0],[6000,0],[6000,8000],[0,8000],[3000,4000]]);
assert.equal(mesh.length,4);assert.ok(mesh.every(t=>t.every(i=>i>=0&&i<5)));
const pixels=new Uint8Array(8*8*4);
for(let y=2;y<6;y++)for(let x=2;x<6;x++){const i=(y*8+x)*4;pixels[i]=120;pixels[i+1]=200;pixels[i+2]=240;pixels[i+3]=80;}
assert.throws(()=>Morph.distanceTextures(pixels,8,8,96),/no foreground/);
const result=Morph.distanceTextures(pixels,8,8,32);
assert.ok(result.distance[(3*8+3)*4]>127);assert.ok(result.distance[0]<127);
assert.equal(result.color[0],120);assert.equal(result.color[1],200);
console.log('Renderer behavior: passed stage counts 2/3/7, non-default geometry, large cells, alpha threshold and SDF/color padding.');
