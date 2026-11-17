export const pitchClasses = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const mod12 = (n: number) => ((n % 12) + 12) % 12;

export function noteName(midi: number, withOctave = true): string {
  const rounded = Math.round(midi);
  return `${pitchClasses[mod12(rounded)]}${withOctave ? Math.floor(rounded / 12) - 1 : ''}`;
}
export function midiToFrequency(midi: number, a4 = 440): number { return a4 * 2 ** ((midi - 69) / 12); }
export function frequencyToMidi(frequency: number, a4 = 440): number { return 69 + 12 * Math.log2(frequency / a4); }

export interface Scale {
  id: string; name: string; english: string; intervals: number[]; formula: string; description: string; chords: string;
}
export const scales: Scale[] = [
  { id:'ionian', name:'아이오니안', english:'Ionian · Major', intervals:[0,2,4,5,7,9,11], formula:'1 2 3 4 5 6 7', description:'메이저 스케일. 밝고 안정적인 사운드의 출발점입니다.', chords:'maj7 · 6 · add9' },
  { id:'dorian', name:'도리안', english:'Dorian', intervals:[0,2,3,5,7,9,10], formula:'1 2 ♭3 4 5 6 ♭7', description:'마이너에 장6도가 더해집니다. 모달 재즈와 펑크에서 자주 들을 수 있습니다.', chords:'m7 · m6 · m9' },
  { id:'phrygian', name:'프리지안', english:'Phrygian', intervals:[0,1,3,5,7,8,10], formula:'1 ♭2 ♭3 4 5 ♭6 ♭7', description:'단2도의 긴장감이 특징인 마이너 모드입니다.', chords:'m7 · sus(♭9)' },
  { id:'lydian', name:'리디안', english:'Lydian', intervals:[0,2,4,6,7,9,11], formula:'1 2 3 ♯4 5 6 7', description:'메이저에 증4도. 열린 공간감과 부유하는 색채를 만듭니다.', chords:'maj7 · maj7(♯11)' },
  { id:'mixolydian', name:'믹솔리디안', english:'Mixolydian', intervals:[0,2,4,5,7,9,10], formula:'1 2 3 4 5 6 ♭7', description:'장3도와 단7도가 도미넌트 코드의 성격을 만듭니다.', chords:'7 · 9 · 13' },
  { id:'aeolian', name:'에올리안', english:'Aeolian · Natural minor', intervals:[0,2,3,5,7,8,10], formula:'1 2 ♭3 4 5 ♭6 ♭7', description:'내추럴 마이너. 서정적인 단조 멜로디에 어울립니다.', chords:'m7 · m9 · m(♭6)' },
  { id:'locrian', name:'로크리안', english:'Locrian', intervals:[0,1,3,5,6,8,10], formula:'1 ♭2 ♭3 4 ♭5 ♭6 ♭7', description:'단3도와 감5도를 가진 모드. 하프 디미니시 코드 위에서 연습해 보세요.', chords:'m7♭5 · ø7' },
  { id:'major-pentatonic', name:'메이저 펜타토닉', english:'Major pentatonic', intervals:[0,2,4,7,9], formula:'1 2 3 5 6', description:'다섯 음으로 구성되어 멜로디를 만들기 좋은 기본 스케일입니다.', chords:'major · 6' },
  { id:'minor-pentatonic', name:'마이너 펜타토닉', english:'Minor pentatonic', intervals:[0,3,5,7,10], formula:'1 ♭3 4 5 ♭7', description:'블루스, 록, 펑크 솔로의 기본 어휘입니다.', chords:'minor · m7 · blues 7' },
  { id:'blues', name:'마이너 블루스', english:'Minor blues', intervals:[0,3,5,6,7,10], formula:'1 ♭3 4 ♭5 5 ♭7', description:'마이너 펜타토닉에 블루 노트 ♭5를 더합니다.', chords:'blues 7 · m7' },
  { id:'harmonic-minor', name:'하모닉 마이너', english:'Harmonic minor', intervals:[0,2,3,5,7,8,11], formula:'1 2 ♭3 4 5 ♭6 7', description:'장7도의 리딩 톤을 사용하는 단조 스케일입니다.', chords:'m(maj7) · minor ii–V–i' },
  { id:'melodic-minor', name:'멜로딕 마이너', english:'Jazz melodic minor', intervals:[0,2,3,5,7,9,11], formula:'1 2 ♭3 4 5 6 7', description:'재즈에서는 상·하행 모두 같은 음을 사용하는 멜로딕 마이너를 뜻합니다.', chords:'m(maj7) · m6' },
  { id:'altered', name:'얼터드', english:'Altered · Super Locrian', intervals:[0,1,3,4,6,8,10], formula:'1 ♭9 ♯9 3 ♭5 ♯5 ♭7', description:'도미넌트에서 반음 위 멜로딕 마이너의 음을 사용합니다.', chords:'7alt · 7(♭9♯9)' },
  { id:'lydian-dominant', name:'리디안 도미넌트', english:'Lydian dominant', intervals:[0,2,4,6,7,9,10], formula:'1 2 3 ♯4 5 6 ♭7', description:'♯11을 가진 도미넌트의 밝은 긴장감을 연습합니다.', chords:'7(♯11) · 9(♯11)' },
  { id:'whole-tone', name:'홀 톤', english:'Whole tone', intervals:[0,2,4,6,8,10], formula:'1 2 3 ♯4 ♯5 ♭7', description:'모든 음 사이가 온음인 대칭 스케일입니다.', chords:'7♯5 · aug' },
  { id:'half-whole-diminished', name:'디미니시드 · 반음–온음', english:'Half–whole diminished', intervals:[0,1,3,4,6,7,9,10], formula:'1 ♭9 ♯9 3 ♯11 5 13 ♭7', description:'반음과 온음을 번갈아 쌓아 도미넌트 텐션을 만듭니다.', chords:'7♭9 · 13♭9' },
];
export function getScale(root: number, scaleId: string): number[] {
  const scale = scales.find(s => s.id === scaleId || (scaleId === 'major' && s.id === 'ionian') || (scaleId === 'minor' && s.id === 'aeolian'));
  if (!scale) return [];
  return scale.intervals.map(i => mod12(root + i));
}

export interface ChordQuality { id: string; name: string; intervals: number[] }
export const chordQualities: ChordQuality[] = [
  {id:'major',name:'Major',intervals:[0,4,7]}, {id:'minor',name:'Minor',intervals:[0,3,7]},
  {id:'dom7',name:'7',intervals:[0,4,7,10]}, {id:'maj7',name:'maj7',intervals:[0,4,7,11]},
  {id:'min7',name:'m7',intervals:[0,3,7,10]}, {id:'six',name:'6',intervals:[0,4,7,9]},
  {id:'min6',name:'m6',intervals:[0,3,7,9]}, {id:'sus2',name:'sus2',intervals:[0,2,7]},
  {id:'sus4',name:'sus4',intervals:[0,5,7]}, {id:'dim',name:'dim',intervals:[0,3,6]},
  {id:'dim7',name:'dim7',intervals:[0,3,6,9]}, {id:'halfdim7',name:'m7♭5',intervals:[0,3,6,10]},
  {id:'aug',name:'aug',intervals:[0,4,8]}, {id:'add9',name:'add9',intervals:[0,4,7,14]},
  {id:'maj9',name:'maj9',intervals:[0,4,7,11,14]}, {id:'min9',name:'m9',intervals:[0,3,7,10,14]},
  {id:'dom9',name:'9',intervals:[0,4,7,10,14]}, {id:'power',name:'5',intervals:[0,7]},
];
export function getChordNotes(root: number, qualityId: string): number[] {
  return chordQualities.find(c => c.id === qualityId)?.intervals.map(i => mod12(root+i)) ?? [];
}

const familiarShapes: Record<string, number[]> = {
  '0:major':[-1,3,2,0,1,0], '2:major':[-1,-1,0,2,3,2], '4:major':[0,2,2,1,0,0],
  '5:major':[1,3,3,2,1,1], '7:major':[3,2,0,0,0,3], '9:major':[-1,0,2,2,2,0], '11:major':[-1,2,4,4,4,2],
  '0:minor':[-1,3,5,5,4,3], '2:minor':[-1,-1,0,2,3,1], '4:minor':[0,2,2,0,0,0],
  '5:minor':[1,3,3,1,1,1], '7:minor':[3,5,5,3,3,3], '9:minor':[-1,0,2,2,1,0], '11:minor':[-1,2,4,4,3,2],
  '0:dom7':[-1,3,2,3,1,3], '2:dom7':[-1,-1,0,2,1,2], '4:dom7':[0,2,0,1,0,0],
  '5:dom7':[1,3,1,2,1,1], '7:dom7':[3,2,0,0,0,1], '9:dom7':[-1,0,2,0,2,0], '11:dom7':[-1,2,1,2,0,2],
  '0:maj7':[-1,3,2,0,0,0], '2:maj7':[-1,-1,0,2,2,2], '4:maj7':[0,2,1,1,0,0],
  '5:maj7':[-1,-1,3,2,1,0], '7:maj7':[3,2,0,0,0,2], '9:maj7':[-1,0,2,1,2,0], '11:maj7':[-1,2,4,3,4,2],
  '0:min7':[-1,3,5,3,4,3], '2:min7':[-1,-1,0,2,1,1], '4:min7':[0,2,0,0,0,0],
  '5:min7':[1,3,1,1,1,1], '7:min7':[3,5,3,3,3,3], '9:min7':[-1,0,2,0,1,0], '11:min7':[-1,2,4,2,3,2],
};

/** Pitch-correct compact shapes; -1 means mute. Roots are present in every result. */
export function getChordVoicings(root: number, qualityId: string, tuning = [40,45,50,55,59,64]): number[][] {
  const notes = getChordNotes(root, qualityId);
  if (!notes.length || tuning.length < 2 || tuning.length > 8) return [];
  const all: {frets:number[]; score:number}[] = [];
  const seen = new Set<string>();
  // Each four-fret window bounds the hand span and the branching factor.
  for (let start=1; start<=10; start++) {
    const options = tuning.map(open => [-1, ...(notes.includes(mod12(open)) ? [0] : []), ...Array.from({length:4},(_,i)=>start+i).filter(f=>notes.includes(mod12(open+f)))]);
    const visit = (string:number, frets:number[], covered:Set<number>, sounding:number) => {
      if (covered.size + (tuning.length-string) < notes.length) return;
      if (string === tuning.length) {
        if (covered.size !== notes.length || sounding < Math.min(3,notes.length)) return;
        const key=frets.join(',');
        if (seen.has(key)) return;
        seen.add(key);
        const pressed=frets.filter(f=>f>0);
        const distinct=new Set(pressed);
        if (distinct.size>4) return;
        const min=pressed.length?Math.min(...pressed):0;
        const max=pressed.length?Math.max(...pressed):0;
        const first=frets.findIndex(f=>f>=0);
        const bass=mod12(tuning[first]+frets[first]);
        // Mutes inside a shape are possible, but prefer shapes easy to strum.
        const last=frets.findLastIndex(f=>f>=0);
        const interiorMutes=frets.slice(first,last).filter(f=>f<0).length;
        const score=max*.8+(max-min)*1.3+distinct.size*.4+interiorMutes*2.5+(bass!==mod12(root)?2:0)-sounding*.18;
        all.push({frets:[...frets],score});
        return;
      }
      for(const fret of options[string]) {
        const next = fret<0 ? covered : new Set([...covered,mod12(tuning[string]+fret)]);
        visit(string+1,[...frets,fret],next,sounding+(fret>=0?1:0));
      }
    };
    visit(0,[],new Set(),0);
  }
  all.sort((a,b)=>a.score-b.score);
  const standardTuning=tuning.length===6 && tuning.every((n,i)=>n===[40,45,50,55,59,64][i]);
  const familiar=standardTuning ? familiarShapes[`${mod12(root)}:${qualityId}`] : undefined;
  const result:number[][]=familiar ? [[...familiar]] : [];
  for(const candidate of all) {
    // Keep useful position variety instead of three nearly identical mutes.
    const position=Math.max(...candidate.frets.filter(f=>f>=0));
    if(result.some(v=>Math.abs(Math.max(...v)-position)<2)) continue;
    result.push(candidate.frets);
    if(result.length===4) break;
  }
  return result;
}
