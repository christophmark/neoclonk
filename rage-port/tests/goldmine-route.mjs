// Host-side planning from read-only original material pixels. This chooses
// ordinary original Dig command destinations; it never changes engine state.
export function planDigToGold(terrain,materials,start,objects=[]){
 const stride=8,W=Math.floor(terrain.width/stride),H=Math.floor(terrain.height/stride),size=W*H;
 const indices=name=>materials.find(m=>m.name===name)?.index;
 const blocked=new Set(['Rock','Granite','Gold','Vehicle','Water','Acid','Lava','DuroLava'].map(indices));
 const gold=indices('Gold'),grid=terrain.materials,w=terrain.width;
 const hazards=objects.filter(o=>!o.contained&&['FLNT','SFLN','TFLN','STFL'].includes(o.id));
 const at=(x,y)=>grid[Math.round(y)*w+Math.round(x)];
 const valid=new Uint8Array(size),near=new Int32Array(size);near.fill(-1);
 for(let gy=2;gy<H-3;gy++)for(let gx=2;gx<W-2;gx++){
  const x=gx*stride,y=gy*stride,i=gy*W+gx;let clear=true;
  for(const [dx,dy] of [[0,0],[-5,0],[5,0],[0,-9],[0,9],[-5,-7],[5,-7],[-5,7],[5,7]])if(blocked.has(at(x+dx,y+dy))){clear=false;break;}
  if(!clear||hazards.some(o=>Math.hypot(x-o.x,y-o.y)<22))continue;valid[i]=1;
  for(let dy=-18;dy<=-8&&near[i]<0;dy+=2)for(let dx=-18;dx<=18;dx+=2)if(dx*dx+dy*dy<=18*18&&at(x+dx,y+dy)===gold){near[i]=(y+dy)*w+x+dx;break;}
 }
 let origin=Math.round(start.y/stride)*W+Math.round(start.x/stride);valid[origin]=1;
 const parents=new Int32Array(size);parents.fill(-1);parents[origin]=origin;
 const distances=new Float64Array(size);distances.fill(Infinity);distances[origin]=0;
 const heap=[];
 const push=(i,d)=>{let k=heap.length;heap.push([i,d]);while(k){const p=(k-1)>>1;if(heap[p][1]<=d)break;[heap[p],heap[k]]=[heap[k],heap[p]];k=p;}};
 const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let k=0;while(true){let n=k,l=k*2+1,r=l+1;if(l<heap.length&&heap[l][1]<heap[n][1])n=l;if(r<heap.length&&heap[r][1]<heap[n][1])n=r;if(n===k)break;[heap[k],heap[n]]=[heap[n],heap[k]];k=n;}}return first;};
 push(origin,0);let goal=-1;
 while(heap.length){const [i,d]=pop();if(d!==distances[i])continue;if(near[i]>=0){goal=i;break;}const x=i%W,y=Math.floor(i/W);
  for(const [dx,dy] of [[-1,1],[1,1],[0,1],[-1,0],[1,0]]){const nx=x+dx,ny=y+dy,j=ny*W+nx;if(nx<2||nx>=W-2||ny>=H-3||!valid[j])continue;
   const value=at(nx*stride,ny*stride),cost=d+(dx&&dy?1.414:1)+(value===-1?12:0);
   if(cost<distances[j]){distances[j]=cost;parents[j]=i;push(j,cost);}
  }
 }
 if(goal<0)throw new Error('No downward dig route to exposed gold edge; requires another original tool or approach');
 const reverse=[];for(let i=goal;i!==origin;i=parents[i])reverse.push({x:(i%W)*stride,y:Math.floor(i/W)*stride});reverse.push({x:(origin%W)*stride,y:Math.floor(origin/W)*stride});const path=reverse.reverse();
 const waypoints=[];let previousDirection;
 for(let i=1;i<path.length;i++){const direction=[Math.sign(path[i].x-path[i-1].x),Math.sign(path[i].y-path[i-1].y)].join(',');if(previousDirection&&direction!==previousDirection)waypoints.push(path[i-1]);previousDirection=direction;}
 waypoints.push(path.at(-1));const gp=near[goal];return {path,waypoints,gold:{x:gp%w,y:Math.floor(gp/w)}};
}
