const labels = {
  Balkan: [54.9, 39.55], Ahal: [57.8, 38.8], Daşoguz: [59.1, 41.1],
  Lebap: [62.15, 39.45], Mary: [62.0, 37.48]
};
const colors = ['#cfe3d8','#e5e7c5','#cfe2ce','#b9d6cd','#dbe8ca'];
let data;
const width=660, height=422;
const project=([lon,lat])=>[24+(lon-52)*41.4,18+(42.8-lat)*49];

export async function drawMap(canvas, active, onChoose) {
  if (!data) {
    const response=await fetch('/boundaries.json');
    if (!response.ok) throw new Error('Map geometry unavailable');
    data=await response.json();
  }
  if(!canvas.isConnected) return;
  const context=canvas.getContext('2d');
  const ratio=Math.min(window.devicePixelRatio||1,2);
  canvas.width=width*ratio;
  canvas.height=height*ratio;
  context.setTransform(ratio,0,0,ratio,0,0);
  context.fillStyle='#eef3ef';
  context.fillRect(0,0,width,height);
  const paths=Object.entries(data).map(([name,rings],index)=>{
    const path=new Path2D();
    for (const ring of rings) {
      ring.forEach((point,i)=>{
        const [x,y]=project(point);
        if (i===0) path.moveTo(x,y);
        else path.lineTo(x,y);
      });
      path.closePath();
    }
    context.fillStyle=name===active?'#1b6651':colors[index];
    context.fill(path,'evenodd');
    context.lineWidth=1.4;
    context.strokeStyle='#fff';
    context.stroke(path);
    return [name,path];
  });
  context.font='700 15px system-ui,sans-serif';
  context.textAlign='center';
  for (const [name,coordinate] of Object.entries(labels)) {
    const [x,y]=project(coordinate);
    context.fillStyle=name===active?'#fff':'#234838';
    context.fillText(name,x,y);
  }
  const [capitalX,capitalY]=project([58.383,37.96]);
  context.beginPath();
  context.arc(capitalX,capitalY,active==='Aşgabat'?8:5,0,Math.PI*2);
  context.fillStyle=active==='Aşgabat'?'#14604a':'#905d27';
  context.fill();
  context.lineWidth=2;
  context.strokeStyle='#fff';
  context.stroke();
  context.textAlign='left';
  context.strokeStyle='#fff';
  context.lineWidth=3;
  context.strokeText('Aşgabat',capitalX+9,capitalY+19);
  context.fillStyle='#234838';
  context.fillText('Aşgabat',capitalX+9,capitalY+19);
  canvas.addEventListener('click',event=>{
    const box=canvas.getBoundingClientRect();
    const x=(event.clientX-box.left)*width/box.width;
    const y=(event.clientY-box.top)*height/box.height;
    if(Math.hypot(x-capitalX,y-capitalY)<15){onChoose('Aşgabat');return;}
    const match=paths.find(([,path])=>context.isPointInPath(path,x*ratio,y*ratio,'evenodd'));
    if(match) onChoose(match[0]);
  });
}
