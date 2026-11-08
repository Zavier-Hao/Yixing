import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PET_ANIMATIONS,petAnimationFrame,worldStep} from '../dist/pet.js';

test('all six sprite sequences match the packed atlas',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../dist/assets/pet-frames/manifest.json',import.meta.url)));
 for(const [key,animation] of Object.entries(PET_ANIMATIONS)){
  assert.equal(animation.row,manifest.rows[key].row);
  assert.equal(animation.frames,manifest.rows[key].frames);
  assert.equal(animation.durations.length,animation.frames);
 }
});
test('falling from above lands on the chat roof; ascending from below passes through',()=>{
 const world={width:1200,floor:850,platform:{left:650,right:1100,top:250}};
 const pet={x:750,y:10,vx:0,vy:100,width:130,height:150,surface:null};
 for(let i=0;i<100;i++)worldStep(pet,.016,world);
 assert.equal(pet.surface,'chat');assert.equal(pet.y+pet.height,250);
 pet.y=300;pet.vy=-800;const result=worldStep(pet,.035,world);
 assert.equal(result.hit,false);assert.equal(pet.surface,null);assert(pet.vy<0);
});
test('walking off the chat roof falls to the page floor; the pet can reach the right side',()=>{
 const world={width:1200,floor:850,platform:{left:650,right:1100,top:250}};
 const pet={x:1000,y:100,vx:200,vy:0,width:130,height:150,surface:'chat'};
 let leftRoof=false;
 for(let i=0;i<400;i++){worldStep(pet,.016,world);if(pet.surface===null)leftRoof=true;}
 assert(leftRoof);assert.equal(pet.surface,'ground');assert.equal(pet.y+pet.height,850);assert(pet.x>600);
});
test('running loops; rolling, petting and landing finish on their last frame',()=>{
 const run=petAnimationFrame('run',0);assert.equal(petAnimationFrame('run',run.duration).index,0);
 assert.equal(petAnimationFrame('run',95).index,1);
 for(const mode of ['roll','pet','fall']){
  const last=petAnimationFrame(mode,100000);const key=mode==='fall'?'release':mode;
  assert.equal(last.index,PET_ANIMATIONS[key].frames-1);
 }
});
test('reading and responding retain the book sequence; reduced motion holds a still pose',()=>{
 assert.equal(petAnimationFrame('read',900).row,0);
 assert.equal(petAnimationFrame('talk',900).row,0);
 for(const mode of ['idle','run','roll','pet','drag','fall'])assert.equal(petAnimationFrame(mode,900,true).index,0);
});
