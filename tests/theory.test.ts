import test from 'node:test';
import assert from 'node:assert/strict';
import { chordQualities, frequencyToMidi, getChordNotes, getChordVoicings, getScale, midiToFrequency, noteName, scales } from '../src/lib/theory.ts';
import { tunings } from '../src/data/tunings.ts';
import { standards } from '../src/data/standards.ts';

test('equal temperament calibrates A4, low B and round trips', () => {
  assert.equal(midiToFrequency(69), 440);
  assert.ok(Math.abs(midiToFrequency(23)-30.867706)<0.00001);
  assert.equal(midiToFrequency(69,442),442);
  for(let midi=21;midi<=100;midi++) assert.ok(Math.abs(frequencyToMidi(midiToFrequency(midi))-midi)<1e-10);
  assert.equal(noteName(23),'B0');
  assert.equal(noteName(60),'C4');
  assert.equal(noteName(60,false),'C');
});

test('all presets are ordered pitches with unique IDs and correct extended bass', () => {
  assert.ok(tunings.length>=30);
  assert.equal(new Set(tunings.map(t=>t.id)).size,tunings.length);
  for(const tuning of tunings) {
    assert.ok(tuning.strings.length>=4 && tuning.strings.length<=8);
    assert.ok(tuning.strings.every((n,i)=>Number.isInteger(n) && (i===0 || n>tuning.strings[i-1])));
  }
  assert.deepEqual(tunings.find(t=>t.id==='bass-6-standard')?.strings,[23,28,33,38,43,48]);
  assert.deepEqual(tunings.find(t=>t.id==='guitar-drop-c')?.strings,[36,43,48,53,57,62]);
});

test('mode intervals and transposition preserve pitch classes', () => {
  assert.deepEqual(getScale(2,'dorian'),[2,4,5,7,9,11,0]);
  assert.deepEqual(getScale(7,'mixolydian'),[7,9,11,0,2,4,5]);
  assert.deepEqual(getScale(0,'lydian'),[0,2,4,6,7,9,11]);
  assert.deepEqual(getScale(0,'locrian'),[0,1,3,5,6,8,10]);
  for(const scale of scales) assert.equal(new Set(scale.intervals).size,scale.intervals.length);
  assert.deepEqual(getScale(0,'unknown'),[]);
});

test('chord shapes contain all requested tones, no foreign tones, and fit four frets', () => {
  for(const quality of chordQualities) {
    for(const root of Array.from({length:12},(_,i)=>i)) {
      const expected=getChordNotes(root,quality.id);
      const shapes=getChordVoicings(root,quality.id);
      assert.ok(shapes.length>0,`${root} ${quality.id} has shapes`);
      for(const frets of shapes) {
        const pitches=frets.flatMap((f,i)=>f<0?[]:[([40,45,50,55,59,64][i]+f)%12]);
        assert.deepEqual([...new Set(pitches)].sort((a,b)=>a-b),[...expected].sort((a,b)=>a-b));
        const pressed=frets.filter(f=>f>0);
        assert.ok(!pressed.length || Math.max(...pressed)-Math.min(...pressed)<=3);
      }
    }
  }
});

test('alternate tuning shapes use actual selected pitches', () => {
  const tuning=[38,45,50,55,59,64];
  for(const frets of getChordVoicings(2,'major',tuning)) {
    const pitches=frets.flatMap((f,i)=>f<0?[]:[(tuning[i]+f)%12]);
    assert.ok(pitches.every(p=>[2,6,9].includes(p)));
    assert.ok([2,6,9].every(p=>pitches.includes(p)));
  }
});

test('score library distinguishes original and traditional notation from commercial standards', () => {
  assert.equal(new Set(standards.map(s=>s.id)).size,standards.length);
  assert.ok(standards.filter(s=>s.kind==='standard').length>=8);
  for(const standard of standards) {
    assert.ok(standard.sections.flatMap(s=>s.bars).length>0);
    assert.ok(standard.scoreUrl.startsWith('https://'));
    if(standard.kind==='standard') assert.equal(standard.abc,undefined);
    else assert.ok(standard.abc?.includes('K:'));
  }
});
