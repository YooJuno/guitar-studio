import { useEffect, useMemo, useRef, useState } from 'react';
import { renderAbc } from 'abcjs';
import { Bookmark, Check, ChevronLeft, ChevronRight, ExternalLink, FileMusic, Play, Search, Upload, Volume2, X } from 'lucide-react';
import { chordQualities, getChordNotes, getChordVoicings, getScale, midiToFrequency, noteName, pitchClasses, scales } from './lib/theory';
import { playNotes, stopNotes } from './lib/synth';
import { standards } from './data/standards';
import type { Standard } from './data/standards';
import './music.css';

export interface MusicViewProps {
  strings: number[];
  favorites: string[];
  onFavorite: (id: string) => void;
  onTempo: (bpm: number) => void;
}

function RootSelect({ value, onChange }: {value:number;onChange:(value:number)=>void}) {
  return <label>루트<select value={value} onChange={event=>onChange(+event.target.value)}>{pitchClasses.map((name,i)=><option value={i} key={name}>{name}</option>)}</select></label>;
}
function FavoriteButton({saved,onClick,label}:{saved:boolean;onClick:()=>void;label:string}) {
  return <button className={`icon-button music-favorite ${saved?'saved':''}`} aria-label={`${label} 즐겨찾기 ${saved?'해제':'추가'}`} title={saved?'즐겨찾기 해제':'즐겨찾기 추가'} aria-pressed={saved} onClick={onClick}><Bookmark size={18} fill={saved?'currentColor':'none'}/></button>;
}
function TuningReadout({strings}:{strings:number[]}) {
  return <span className="music-tuning small muted">현재 튜닝 <b>{strings.map(m=>noteName(m,false)).join(' · ')}</b><span>낮은 현 → 높은 현</span></span>;
}

function ChordDiagram({frets,strings,root,label}:{frets:number[];strings:number[];root:number;label:string}) {
  const pressed=frets.filter(f=>f>0);
  const max=Math.max(0,...pressed);
  const first=max<=4?1:Math.min(...pressed);
  const x=(i:number)=>42+i*176/(strings.length-1);
  const top=68;
  const spacing=37;
  return <svg viewBox="0 0 260 273" className="chord-diagram" role="img" aria-label={`${label}, 낮은 현부터 ${frets.map(f=>f<0?'뮤트':f===0?'개방':`${f}프렛`).join(', ')}`}>
    <text x="15" y={top+24} className="diagram-fret">{first}fr</text>
    {Array.from({length:5},(_,i)=><line key={`f${i}`} x1="42" x2="218" y1={top+i*spacing} y2={top+i*spacing} stroke={i===0&&first===1?'#30362e':'#d7dbd1'} strokeWidth={i===0&&first===1?5:1.4}/>)}
    {strings.map((midi,i)=><g key={i}>
      <line x1={x(i)} x2={x(i)} y1={top} y2={top+4*spacing} stroke="#939b8b" strokeWidth={Math.max(1,2-i*.16)}/>
      {frets[i]<0?<g stroke="#90958c" strokeWidth="1.6"><path d={`M ${x(i)-4} 43 l 8 8 M ${x(i)+4} 43 l -8 8`}/></g>:frets[i]===0?<circle cx={x(i)} cy="47" r="5" fill="none" stroke="#6c7565" strokeWidth="1.5"/>:<g><circle cx={x(i)} cy={top+(frets[i]-first+.5)*spacing} r="13" fill={(midi+frets[i])%12===root?'#b9f37c':'#30362e'}/><text x={x(i)} y={top+(frets[i]-first+.5)*spacing+4} textAnchor="middle" fill={(midi+frets[i])%12===root?'#24351b':'white'} className="diagram-note">{noteName(midi+frets[i],false)}</text></g>}
      <text x={x(i)} y="244" textAnchor="middle" className="diagram-string">{noteName(midi,false)}</text>
      <text x={x(i)} y="261" textAnchor="middle" className="diagram-tab">{frets[i]<0?'×':frets[i]}</text>
    </g>)}
  </svg>;
}

export function ChordsView({strings,favorites,onFavorite}:MusicViewProps) {
  const [root,setRoot]=useState(0);
  const [quality,setQuality]=useState('major');
  const [arpeggio,setArpeggio]=useState(false);
  const [error,setError]=useState('');
  const shapes=useMemo(()=>getChordVoicings(root,quality,strings),[root,quality,strings]);
  const notes=getChordNotes(root,quality);
  const selectedQuality=chordQualities.find(c=>c.id===quality)!;
  const name=`${pitchClasses[root]}${quality==='major'?'':quality==='minor'?'m':selectedQuality.name}`;
  const favoriteId=`chord:${root}:${quality}`;
  useEffect(()=>()=>stopNotes(),[]);
  async function listen(frets:number[]) {
    setError('');
    try { await playNotes(frets.flatMap((f,i)=>f<0?[]:[midiToFrequency(strings[i]+f)]),arpeggio); }
    catch {setError('소리를 재생할 수 없습니다. 오디오 출력 장치를 확인해 주세요.');}
  }
  return <div className="music-workspace">
    <section className="card music-controls">
      <div className="section-heading"><h3>코드 찾기</h3><TuningReadout strings={strings}/></div>
      <div className="music-control-line"><RootSelect value={root} onChange={setRoot}/><label>코드 종류<select value={quality} onChange={e=>setQuality(e.target.value)}>{chordQualities.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label className="music-check"><input type="checkbox" checked={arpeggio} onChange={e=>setArpeggio(e.target.checked)}/>한 음씩 듣기</label></div>
    </section>
    <section className="card music-chord-result">
      <div className="section-heading"><div className="music-result-title"><h2>{name}</h2><div className="music-note-list">{notes.map((n,i)=><span key={n} className={i===0?'tonic':''}>{pitchClasses[n]}</span>)}</div></div><FavoriteButton saved={favorites.includes(favoriteId)} onClick={()=>onFavorite(favoriteId)} label={name}/></div>
      <div className="music-diagram-grid">{shapes.map((frets,i)=><figure key={frets.join(',')} className="music-shape"><figcaption><span>POSITION {String(i+1).padStart(2,'0')}</span><button className="icon-button" aria-label={`${name} ${i+1}번 운지 듣기`} title="코드 듣기" onClick={()=>void listen(frets)}><Volume2 size={18}/></button></figcaption><ChordDiagram frets={frets} strings={strings} root={root} label={name}/><button className="button secondary music-listen" onClick={()=>void listen(frets)}><Play size={14}/> {arpeggio?'아르페지오 듣기':'코드 듣기'}</button></figure>)}</div>
      {!shapes.length&&<div className="music-empty"><FileMusic size={26}/><h3>이 튜닝의 운지 없음</h3><p>코드 종류 또는 튜닝을 바꿔보세요.</p></div>}
      {error&&<p role="alert" className="music-error">{error}</p>}
      <div className="music-diagram-legend"><span><i className="note-dot root"/>루트</span><span><i className="note-dot"/>코드 구성음</span><span>○ 개방현</span><span>× 뮤트</span><span>숫자 = 프렛 번호</span></div>
    </section>
    <details className="music-help"><summary>운지 안내</summary><p>현재 튜닝 기준 · 왼쪽이 낮은 현 · 원 안의 글자는 음이름. 손가락 번호는 표시하지 않습니다.</p></details>
  </div>;
}

function Fretboard({strings,root,pitches,start,onPlay}:{strings:number[];root:number;pitches:number[];start:number;onPlay:(midi:number)=>void}) {
  const height=92+strings.length*43;
  const x=(f:number)=>96+f*66;
  return <div className="music-fret-scroll"><svg viewBox={`0 0 960 ${height}`} className="music-fretboard" role="group" aria-label="스케일 지판. 위쪽이 높은 현이며 음을 클릭하면 소리가 납니다.">
    {Array.from({length:13},(_,i)=><g key={i}><text x={x(i)} y="27" textAnchor="middle" className="fret-number">{start+i}</text>{[3,5,7,9,15,17,19,21].includes(start+i)&&<circle cx={x(i)} cy="42" r="2.5" fill="#bbc2b5"/>}{[12,24].includes(start+i)&&<g fill="#bbc2b5"><circle cx={x(i)-4} cy="42" r="2.5"/><circle cx={x(i)+4} cy="42" r="2.5"/></g>}{i>0&&<line x1={x(i)-33} x2={x(i)-33} y1="65" y2={65+(strings.length-1)*43} stroke="#d7dccf"/>}</g>)}
    {start===0&&<line x1={x(0)+33} x2={x(0)+33} y1="59" y2={71+(strings.length-1)*43} stroke="#59634e" strokeWidth="4"/>}
    {[...strings].reverse().map((open,row)=><g key={`${open}:${row}`}><text x="34" y={70+row*43} textAnchor="middle" className="fret-string-label">{noteName(open)}</text><line x1="66" x2="923" y1={65+row*43} y2={65+row*43} stroke="#a2ac98" strokeWidth={1+row*.2}/>{Array.from({length:13},(_,i)=>{const midi=open+start+i;const pc=midi%12;const isRoot=pc===root;return pitches.includes(pc)?<g key={i} className="fret-note" role="button" tabIndex={0} aria-label={`${noteName(midi)}, ${row+1}번 현 ${start+i}프렛 듣기`} onClick={()=>onPlay(midi)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onPlay(midi);}}}><circle cx={x(i)} cy={65+row*43} r="15" fill={isRoot?'#b9f37c':'#303a2b'} stroke={isRoot?'#8ec34f':'#303a2b'} strokeWidth="1.2"/><text x={x(i)} y={70+row*43} textAnchor="middle" fill={isRoot?'#24351b':'#fff'}>{pitchClasses[pc]}</text></g>:null;})}</g>)}
    <text x="76" y={height-7} className="fret-hint">각 음을 눌러 들어보세요</text><text x="923" y={height-7} textAnchor="end" className="fret-hint">높은 현 ↑ · 낮은 현 ↓</text>
  </svg></div>;
}

export function ScalesView({strings,favorites,onFavorite}:MusicViewProps) {
  const [root,setRoot]=useState(0);
  const [scaleId,setScaleId]=useState('ionian');
  const [start,setStart]=useState(0);
  const [error,setError]=useState('');
  const scale=scales.find(s=>s.id===scaleId)!;
  const pitches=getScale(root,scaleId);
  const favoriteId=`scale:${root}:${scaleId}`;
  useEffect(()=>()=>stopNotes(),[]);
  async function listen(midis:number[],sequence=false) {setError('');try{await playNotes(midis.map(m=>midiToFrequency(m)),sequence);}catch{setError('오디오를 재생하지 못했습니다. 출력 장치를 확인해 주세요.');}}
  return <div className="music-workspace">
    <section className="card music-controls"><div className="section-heading"><h3>모드 · 스케일 탐색</h3><TuningReadout strings={strings}/></div><div className="music-control-line"><RootSelect value={root} onChange={setRoot}/><label>스케일<select value={scaleId} onChange={e=>setScaleId(e.target.value)}>{scales.map(s=><option value={s.id} key={s.id}>{s.english}</option>)}</select></label><label>지판 범위<select value={start} onChange={e=>setStart(+e.target.value)}><option value="0">0–12 프렛</option><option value="5">5–17 프렛</option><option value="12">12–24 프렛</option></select></label></div></section>
    <section className="card music-scale-result"><div className="section-heading"><div><span className="eyebrow">{scale.english}</span><h2>{pitchClasses[root]} {scale.name}</h2></div><FavoriteButton saved={favorites.includes(favoriteId)} onClick={()=>onFavorite(favoriteId)} label={`${pitchClasses[root]} ${scale.name}`}/></div><div className="music-scale-tones">{pitches.map((n,i)=><button key={n} className={i===0?'tonic':''} onClick={()=>void listen([48+root+scale.intervals[i]])} aria-label={`${scale.formula.split(' ')[i]}도 ${pitchClasses[n]} 듣기`}><small>{scale.formula.split(' ')[i]}</small><strong>{pitchClasses[n]}</strong></button>)}</div><div className="music-scale-actions"><span className="small muted">어울리는 코드 <b>{scale.chords}</b></span><button className="button secondary" onClick={()=>void listen([...scale.intervals,12].map(i=>48+root+i),true)}><Play size={14}/> 스케일 듣기</button></div><Fretboard strings={strings} root={root} pitches={pitches} start={start} onPlay={midi=>void listen([midi])}/><div className="music-diagram-legend"><span><i className="note-dot root"/>루트</span><span><i className="note-dot"/>스케일 구성음</span><span>지판은 높은 현이 위쪽입니다</span></div>{error&&<p className="music-error" role="alert">{error}</p>}</section>
    <details className="music-help"><summary>모드 정보</summary><p>{scale.description}</p><p>지판의 음이름은 이명동음으로 간단히 표기합니다.</p></details>
  </div>;
}

const naturalPitches:Record<string,number>={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
function transposeName(name:string,semitones:number):string {
  if(semitones===0)return name;
  return name.split('/').map(part=>part.replace(/^([A-G])([♭♯#b]?)/,(_,letter:string,accidental:string)=>pitchClasses[(naturalPitches[letter]+(accidental==='♭'||accidental==='b'?-1:accidental==='♯'||accidental==='#'?1:0)+semitones+24)%12])).join('/');
}
function chordFrequencies(chord:string):number[] {
  const match=chord.match(/^([A-G])([♭♯#b]?)(.*)$/);
  if(!match)return [];
  const root=(naturalPitches[match[1]]+(['♭','b'].includes(match[2])?-1:['♯','#'].includes(match[2])?1:0)+12)%12;
  const suffix=match[3];
  let intervals:number[];
  if(suffix.includes('m7♭5')||suffix.includes('m7b5'))intervals=[0,3,6,10];
  else if(suffix.includes('dim7'))intervals=[0,3,6,9];
  else if(suffix.includes('m(maj7)'))intervals=[0,3,7,11];
  else if(suffix.includes('maj7'))intervals=[0,4,7,11];
  else if(suffix.includes('m7'))intervals=[0,3,7,10];
  else if(suffix.includes('m6'))intervals=[0,3,7,9];
  else if(suffix.includes('7♭9'))intervals=[0,4,7,10,13];
  else if(suffix.includes('7♯5'))intervals=[0,4,8,10];
  else if(suffix.includes('7'))intervals=[0,4,7,10];
  else if(suffix.includes('6'))intervals=[0,4,7,9];
  else if(suffix.startsWith('m'))intervals=[0,3,7];
  else intervals=[0,4,7];
  return intervals.map(i=>midiToFrequency(48+root+i));
}

function Notation({abc,transpose}:{abc:string;transpose:number}) {
  const target=useRef<HTMLDivElement>(null);
  const [error,setError]=useState('');
  useEffect(()=>{if(!target.current)return;try{renderAbc(target.current,abc,{responsive:'resize',add_classes:true,visualTranspose:transpose,paddingtop:18,paddingbottom:22,staffwidth:800});setError('');}catch{setError('악보를 표시하지 못했습니다. 아래 코드 차트를 이용해 주세요.');}return()=>{target.current?.replaceChildren();};},[abc,transpose]);
  return <div className="music-notation"><div ref={target}/>{error&&<p role="alert" className="music-error">{error}</p>}</div>;
}

export function JazzView({favorites,onFavorite,onTempo}:MusicViewProps) {
  const [query,setQuery]=useState('');
  const [style,setStyle]=useState('all');
  const [onlyFavorites,setOnlyFavorites]=useState(false);
  const [selectedId,setSelectedId]=useState(standards[0].id);
  const [transpose,setTranspose]=useState(0);
  const [tempoApplied,setTempoApplied]=useState(false);
  const [error,setError]=useState('');
  const [pdf,setPdf]=useState<{url:string;name:string}|null>(null);
  const uploadSequence=useRef(0);
  const fileInput=useRef<HTMLInputElement>(null);
  const selected=standards.find(s=>s.id===selectedId)!;
  const filtered=standards.filter(s=>(style==='all'||s.style===style)&&(query.trim()===''||`${s.title} ${s.composer} ${s.style} ${s.key}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))&&(!onlyFavorites||favorites.includes(`jazz:${s.id}`)));
  useEffect(()=>()=>stopNotes(),[]);
  useEffect(()=>()=>{if(pdf)URL.revokeObjectURL(pdf.url);},[pdf]);
  useEffect(()=>()=>{uploadSequence.current++;},[]);
  function select(standard:Standard){setSelectedId(standard.id);setTranspose(0);setTempoApplied(false);setError('');stopNotes();}
  async function upload(file?:File){if(!file)return;setError('');const seq=++uploadSequence.current;if(file.size>20*1024*1024){setError('PDF는 20MB 이하 파일을 선택해 주세요.');return;}try{const header=new TextDecoder().decode(await file.slice(0,5).arrayBuffer());if(header!=='%PDF-'){setError('PDF 파일을 선택해 주세요.');return;}if(seq!==uploadSequence.current)return;setPdf({url:URL.createObjectURL(file),name:file.name});}catch{setError('파일을 열지 못했습니다. 다른 PDF를 선택해 주세요.');}}
  async function hear(chord:string){setError('');try{await playNotes(chordFrequencies(chord));}catch{setError('코드 소리를 재생하지 못했습니다. 오디오 출력을 확인해 주세요.');}}
  return <div className="music-jazz-layout">
    <section className="card music-library"><div className="section-heading"><h3>레퍼토리</h3><span className="small muted">{standards.length}곡</span></div><label className="music-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="곡 · 작곡가 검색" aria-label="재즈 곡 검색"/></label><div className="music-library-filters"><select value={style} onChange={e=>setStyle(e.target.value)} aria-label="장르 필터"><option value="all">모든 스타일</option>{[...new Set(standards.map(s=>s.style))].map(s=><option value={s} key={s}>{s}</option>)}</select><button className={`icon-button ${onlyFavorites?'saved':''}`} aria-label="즐겨찾기만 보기" title="즐겨찾기만 보기" aria-pressed={onlyFavorites} onClick={()=>setOnlyFavorites(!onlyFavorites)}><Bookmark size={17} fill={onlyFavorites?'currentColor':'none'}/></button></div><div className="music-song-list">{filtered.map(s=><article className={`music-song ${s.id===selectedId?'selected':''}`} key={s.id}><button className="music-song-select" onClick={()=>select(s)} aria-pressed={s.id===selectedId}><strong>{s.title}</strong><span>{s.key} <i>·</i> {s.style}</span><small>{s.kind==='exercise'?'오리지널 연습곡':s.kind==='traditional'?'전통 선율 악보':`${s.form} · ${s.difficulty}`}</small></button><FavoriteButton saved={favorites.includes(`jazz:${s.id}`)} onClick={()=>onFavorite(`jazz:${s.id}`)} label={s.title}/></article>)}</div>{!filtered.length&&<div className="music-empty"><p>조건에 맞는 곡이 없어요.</p><button className="button secondary" onClick={()=>{setQuery('');setStyle('all');setOnlyFavorites(false);}}>전체 곡 보기</button></div>}</section>
    <div className="stack music-score-column"><section className="card music-score-card"><div className="section-heading"><span className="eyebrow">{selected.kind==='standard'?'JAZZ STANDARD':selected.kind==='traditional'?'TRADITIONAL MELODY':'ORIGINAL PRACTICE SCORE'}</span><FavoriteButton saved={favorites.includes(`jazz:${selected.id}`)} onClick={()=>onFavorite(`jazz:${selected.id}`)} label={selected.title}/></div><h2 className="music-song-title">{selected.title}</h2><p className="music-composer">{selected.composer} <span>· {selected.year}</span></p><div className="music-song-meta"><span className="pill">{selected.style}</span><span>{selected.form}</span><span>{selected.difficulty}</span></div><div className="music-score-toolbar"><div className="music-transpose"><span className="small muted">연습 키</span><button className="icon-button" aria-label="반음 내리기" title="반음 내리기" disabled={transpose<=-11} onClick={()=>setTranspose(n=>n-1)}><ChevronLeft size={17}/></button><strong>{transposeName(selected.key,transpose)}</strong><button className="icon-button" aria-label="반음 올리기" title="반음 올리기" disabled={transpose>=11} onClick={()=>setTranspose(n=>n+1)}><ChevronRight size={17}/></button>{transpose!==0&&<button className="music-reset" onClick={()=>setTranspose(0)}>원키</button>}</div><button className="button secondary" onClick={()=>{onTempo(selected.bpm);setTempoApplied(true);}}>{tempoApplied?<Check size={15}/>:<Play size={14}/>} {selected.bpm} BPM {tempoApplied?'적용됨':'적용'}</button></div>
      {selected.abc?<><div className="music-score-label"><FileMusic size={16}/><span>{selected.kind==='exercise'?'오리지널 연습곡 악보':'전통 선율 · 새로 작성한 연습용 화성'}</span></div><Notation abc={selected.abc} transpose={transpose}/></>:<div className="music-score-source"><FileMusic size={25}/><div><strong>정식 멜로디 악보</strong><span className="small muted">Hal Leonard</span></div><a className="button secondary" href={selected.scoreUrl} target="_blank" rel="noreferrer">열기 <ExternalLink size={14}/></a></div>}
      <div className="section-heading music-chart-heading"><h3>연습용 코드 차트</h3><span className="small muted">{selected.abc?"클릭: 코드 듣기":"멜로디 없음 · 클릭: 코드 듣기"}</span></div><div className="music-charts">{selected.sections.map((section,sectionIndex)=><div className="music-chart-section" key={`${section.label}:${sectionIndex}`}><span className="music-section-letter">{section.label}</span><div className="music-bar-grid">{section.bars.map((bar,barIndex)=><div className="music-bar" key={barIndex}><small>{selected.sections.slice(0,sectionIndex).reduce((count,s)=>count+s.bars.length,0)+barIndex+1}</small><div>{bar.map((chord,chordIndex)=>{const transposed=transposeName(chord,transpose);return <button key={chordIndex} onClick={()=>void hear(transposed)} aria-label={`${transposed} 코드 듣기`}>{transposed}</button>;})}</div></div>)}</div></div>)}</div><details className="music-help music-score-help"><summary>곡 · 악보 정보</summary><p>{selected.description}</p><p>{selected.rightsNote}</p><a className="music-source-link small" href={selected.scoreUrl} target="_blank" rel="noreferrer">{selected.scoreLabel} <ExternalLink size={12}/></a></details>{error&&<p className="music-error" role="alert">{error}</p>}</section>
    <section className="card music-pdf-card"><div className="section-heading"><div><h3>내 악보 · PDF</h3></div><button className="button secondary" onClick={()=>fileInput.current?.click()}><Upload size={15}/> PDF 선택</button></div><input className="music-file-input" ref={fileInput} type="file" accept="application/pdf,.pdf" aria-label="내 PDF 악보 선택" onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/>{pdf?<><div className="music-pdf-name"><FileMusic size={16}/><span>{pdf.name}</span><a href={pdf.url} target="_blank" rel="noreferrer" aria-label="내 PDF 새 창에서 열기" title="새 창에서 열기"><ExternalLink size={16}/></a><button className="icon-button" aria-label="내 PDF 닫기" title="닫기" onClick={()=>{uploadSequence.current++;setPdf(null);}}><X size={16}/></button></div><iframe className="music-pdf-preview" src={pdf.url} title={`${pdf.name} 악보 미리보기`}/></>:<p className="small muted music-pdf-privacy">브라우저에서만 열기 · 최대 20MB</p>}</section></div>
  </div>;
}
