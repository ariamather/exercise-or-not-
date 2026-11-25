// Node 22+ and a local Chrome. Render with a dedicated, disposable browser profile.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp, mkdir, rm, writeFile, rename} from 'node:fs/promises';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const dir=dirname(fileURLToPath(import.meta.url));
const staging=resolve(dir,'../../scratch/promo-20261124');
const output=resolve(dir,'../../dist/promo');
const chrome=process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const encoder=process.env.FFMPEG || 'ffmpeg';
const fps=30;
const scenes={
  theory:{name:'05-为什么你总是在纠结',samples:[0,6.7,10.8,16.5,19.5,22,26.4,31.4,35.2,38,41.2,47.5]},
  bedroom:{name:'04-再想五分钟',samples:[0,3.2,6.9,10.5,12.8,16.4,19.5,22.2,26,29.3,32,35.5,37.2,39.5,42,44.3,46.8]},
  decision:{name:'03-为什么还想再掷一次',samples:[1,6.3,11,15,18.7,23,27.8,33.5,38.6,43,46.7]},
  draw:{name:'01-今天练不练',samples:[.7,3.05,4.8,7.7,9.7,11.1,12.8,14.9]},
  journal:{name:'02-上次卧推',samples:[1.4,5.6,7.8,10.1,12.4,15.9,17.6,20.2]}
};
const film=process.argv[2];
if(!scenes[film])throw Error('Choose '+Object.keys(scenes).join(', '));
const preview=process.argv.includes('--stills');
const {name,samples}=scenes[film];
await mkdir(join(staging,'qa'),{recursive:true});await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(staging,'chrome-'));
const app=spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',
  '--disable-sync','--disable-extensions','--disable-gpu','--allow-file-access-from-files','--remote-debugging-pipe',
  '--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','ignore','pipe','pipe']});
const closed=once(app,'close');
let data='',counter=0;
const pending=new Map();
app.stdio[4].on('data',bytes=>{
  data+=bytes.toString();
  let split;
  while((split=data.indexOf('\0'))>=0){
    const msg=JSON.parse(data.slice(0,split));data=data.slice(split+1);
    const resolver=pending.get(msg.id);
    if(resolver){pending.delete(msg.id);msg.error?resolver.reject(Error(msg.error.message)):resolver.resolve(msg.result);}
  }
});
app.on('close',()=>{for(const r of pending.values())r.reject(Error('Chrome closed'));pending.clear();});
function send(method,params={},sessionId) {
  const id=++counter;
  return new Promise((resolve,reject)=>{
    pending.set(id,{resolve,reject});
    app.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');
  });
}
let ff;
try {
  const url=pathToFileURL(join(dir,'index.html'));url.search=new URLSearchParams({render:'1',film}).toString();
  const {targetId}=await send('Target.createTarget',{url:url.href});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  async function js(expression){
    const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);
    if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  let ready=false;
  for(let i=0;!ready && i<120;i++){
    ready=await js('window.ready');
    if(!ready)await new Promise(ok=>setTimeout(ok,100));
  }
  if(!ready)throw Error('Images failed to load');
  async function frame(time){
    const body=await js('drawFrame('+JSON.stringify(film)+','+time+');document.querySelector("canvas").toDataURL("image/jpeg",0.956)');
    return Buffer.from(body.slice(body.indexOf(',')+1),'base64');
  }
  if(preview){
    for(const [i,t] of samples.entries())await writeFile(join(staging,'qa',film+'-'+i+'.jpg'),await frame(t));
  }else{
    const count=Math.round(await js('lengths['+JSON.stringify(film)+']')*fps);
    const dest=join(staging,film+'-encoded.mp4');
    ff=spawn(encoder,['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(fps),'-c:v','mjpeg','-i','pipe:0',
      '-i',join(staging,film+'.wav'),'-map','0:v','-map','1:a','-c:v','libx264','-preset','veryfast','-crf','18',
      '-vf','scale=out_color_matrix=bt709:out_range=tv,format=yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',
      '-x264-params','colorprim=bt709:transfer=bt709:colormatrix=bt709',
      '-af','loudnorm=I='+(film==='draw'?-15:-17)+':TP=-1.8:LRA=9','-ar','48000','-c:a','aac','-b:a','192k','-movflags','+faststart',dest],{stdio:['pipe','inherit','inherit']});
    const done=once(ff,'close');
    for(let i=0;i<count;i++){if(!ff.stdin.write(await frame(i/fps)))await once(ff.stdin,'drain');}
    ff.stdin.end();const [status]=await done;if(status!==0)throw Error('Encoding failed: '+status);
    await rename(dest,join(output,name+'.mp4'));
    console.log(name+' · '+count+' frames');
  }
} finally {
  if(ff && ff.exitCode===null)ff.kill();
  app.kill();await closed;await rm(profile,{recursive:true,force:true});
}
