import ExcelJS from 'exceljs';
import type { AnalysisRecord } from './analysis-record';
import type { ReferenceTile, StudyTile } from './study';
import type { ChannelSettings } from './channel-preview';

export async function channelWorkbook(records:AnalysisRecord[], tiles:StudyTile[]=[],references:ReferenceTile[]=[],accepted:Record<string,ChannelSettings>|null=null) {
 const workbook=new ExcelJS.Workbook();workbook.creator='KidneyQuant';
 const entries=tiles.length?tiles:[{id:'current',name:records[0]?.source.name??'Current',records,screenshots:{},reference:false} as StudyTile];
 const all=entries.flatMap(t=>t.records);
 const headers=['Row','Label / filename','Area','Mean','Min','Max','IntDen','%Area','RawIntDen','MinThr','MaxThr','Area units'];
 const stains=[...new Set(all.map(r=>r.analysis.stain==='Channel intensity (IF)'?`${r.analysis.signalChannel} channel`:r.analysis.stain))];
 const usedNames=new Set(['Reference thresholds','Provenance']);
 for(const staining of stains) {
  let name=staining.replace(/[\\/?*\[\]:]/g,' ').slice(0,31)||'Staining';const base=name;let suffix=2;while(usedNames.has(name)){name=base.slice(0,27)+' '+suffix++;}usedNames.add(name);
  const sheet=workbook.addWorksheet(name);sheet.getRow(1).values=[staining];sheet.getRow(2).values=['Each sample has its own column group. Tiles run vertically. Baseline and threshold-positive rows share the same ROI denominator.'];
  const relevant=entries.flatMap(tile=>tile.records.filter(r=>(r.analysis.stain==='Channel intensity (IF)'?`${r.analysis.signalChannel} channel`:r.analysis.stain)===staining).map(record=>({tile,record})));
  const samples=[...new Set(relevant.map(({record})=>record.sampleId))];
  for(const [sampleIndex,sample] of samples.entries()) {
   const offset=sampleIndex*29;
   for(let i=0;i<29;i++)sheet.getColumn(offset+i+1).width=i===1?32:i<12?15:11;
   sheet.getCell(3,offset+1).value=sample;
   let row=5;
   for(const [index,{tile,record}] of relevant.filter(({record})=>record.sampleId===sample).entries()) {
    headers.forEach((header,i)=>sheet.getCell(row,offset+i+1).value=header);sheet.getRow(row).height=30;sheet.getRow(row+1).height=32;sheet.getRow(row+2).height=32;
    const m=record.metrics,scale=record.source.pixelSizeMicrons ? record.source.pixelSizeMicrons[0]*record.source.pixelSizeMicrons[1] : 1;
    const unit=record.source.pixelSizeMicrons?'µm²':'px²';
    const baseline=[index+1,`${tile.name} — baseline`,m.analyzedPixels*scale,m.meanScoreAllAnalyzedPixels,m.minScoreAllAnalyzedPixels,m.maxScoreAllAnalyzedPixels,m.scoreSumAllAnalyzedPixels*scale,100,m.scoreSumAllAnalyzedPixels,0,record.source.analysisWorkflow==='sirius-magenta'?1:255,unit];
    const positive=[index+1,`${tile.name} — positive`,m.positivePixels*scale,m.meanPositive??null,m.minPositive??null,m.maxPositive??null,(m.sumPositive??0)*scale,m.positivePercent,m.sumPositive??null,record.analysis.minThreshold,record.analysis.maxThreshold,unit];
    for(const [j,values] of [baseline,positive].entries())values.forEach((v,i)=>sheet.getCell(row+1+j,offset+i+1).value=v);
    const channel=record.analysis.signalChannel;
    const sources=record.source.analysisWorkflow==='sirius-magenta'?[tile.screenshots.composite,tile.screenshots.magenta,tile.screenshots.all]:[tile.screenshots[channel],tile.screenshots[channel+'-counted'],tile.screenshots.all];
    sources.forEach((base64,i)=>{if(!base64)return;const imageId=workbook.addImage({base64,extension:'png'});sheet.addImage(imageId,{tl:{col:offset+13+i*5,row:row-1},ext:{width:265,height:265}});});
    row+=20;
   }
  }
  sheet.views=[{state:'frozen',ySplit:4}];
  sheet.eachRow(r=>{r.alignment={vertical:'top',wrapText:true};r.eachCell(c=>{if(typeof c.value==='number')c.numFmt='0.0000';});});sheet.getRow(1).font={bold:true,size:16,color:{argb:'FF1E6B4D'}};
 }
 const ref=workbook.addWorksheet('Reference thresholds');ref.columns=[{width:45},{width:24},{width:18},{width:18},{width:50}];ref.addRow(['Reference tile','Channel / score','Minimum','Fixed maximum','Conversion ranges','Region category','ROIs']);
 for(const tile of references) for(const [key,value] of Object.entries(tile.settings))ref.addRow([tile.name,key,value.minimum,value.maximum,JSON.stringify(tile.conversion),tile.regionCategory??'Whole tissue',JSON.stringify(tile.rois??[])]);
 ref.addRow([]);ref.addRow(['Accepted shared thresholds']);for(const [key,value] of Object.entries(accepted??{}))ref.addRow(['Applied',key,value.minimum,value.maximum]);
 ref.addRow(['8-bit mean minima rounded to nearest integer; Sirius Red means rounded to 4 decimals.']);
 const metadata=workbook.addWorksheet('Provenance');metadata.columns=[{width:35},{width:55},{width:100}];metadata.addRow(['Tile','Field','Value']);
 for(const tile of entries) for(const record of tile.records) {
  const add=(prefix:string,value:unknown)=>{
   if(value!==null && typeof value==='object'&&!Array.isArray(value))for(const [key,child] of Object.entries(value))add(prefix?`${prefix}.${key}`:key,child);
   else metadata.addRow([tile.name,prefix,Array.isArray(value)?JSON.stringify(value):value]);
  };add('',record);add('screenshotDisplaySettings',tile.displaySettings??{});
 }
 for(const sheet of [ref,metadata]){sheet.views=[{state:'frozen',ySplit:1}];sheet.getRow(1).font={bold:true};}
 return new Uint8Array(await workbook.xlsx.writeBuffer());
}
