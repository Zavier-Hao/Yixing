import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PET_ANIMATIONS,petAnimationFrame} from '../dist/pet.js';

test('all six sprite sequences match the packed atlas',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../dist/assets/pet-frames/manifest.json',import.meta.url)));
 for(const [key,animation] of Object.entries(PET_ANIMATIONS)){
  assert.equal(animation.row,manifest.rows[key].row);
  assert.equal(animation.frames,manifest.rows[key].frames);
  assert.equal(animation.durations.length,animation.frames);
 }
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
