import type { AnalysisRecord } from './analysis-record';
import type { RoiRect } from './image-analysis';
import type { ChannelSettings } from './channel-preview';
export type ReferenceTile = { id:string; name:string; settings:Record<string,ChannelSettings>; conversion:unknown; rois?:RoiRect[]; regionCategory?:string };
export type StudyTile = { id:string; name:string; records:AnalysisRecord[]; screenshots:Record<string,string>; displaySettings?:Record<string,ChannelSettings>; reference:boolean };
export function averageThresholds(references:ReferenceTile[], fractional=false) {
 if (!references.length) throw new Error('Save at least one reference tile first.');
 const keys=Object.keys(references[0].settings);
 if(references.some(r=>Object.keys(r.settings).sort().join()!==[...keys].sort().join())) throw new Error('Reference tiles must contain the same channels.');
 return Object.fromEntries(keys.map(key=>{
  const values=references.map(r=>r.settings[key]);
  if(values.some(v=>v.maximum!==values[0].maximum)) throw new Error(`Keep the maximum threshold consistent for ${key}.`);
  const average=values.reduce((sum,v)=>sum+v.minimum,0)/values.length;
  const minimum=fractional ? Number(average.toFixed(4)) : Math.round(average);
  return [key,{minimum,maximum:values[0].maximum,brightness:1,average}];
 }));
}
