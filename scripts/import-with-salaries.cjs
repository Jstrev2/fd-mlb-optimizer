#!/usr/bin/env node
const puppeteer = require('puppeteer-core');
const SUPABASE_URL = 'https://udwafzawzeaoteghfwjq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkd2FmemF3emVhb3RlZ2hmd2pxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM4Mjc1MCwiZXhwIjoyMDg5OTU4NzUwfQ.dbO_BZfeb6X2cBbPyr6cyrJC_SRwSC_Qr9ikn1W1_nc';
const FD_API = 'https://sbapi.il.sportsbook.fanduel.com/api';
const AK = 'FhMFpcPWXMeyZxOx';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const TA = {'Pittsburgh Pirates':'PIT','New York Mets':'NYM','Chicago White Sox':'CWS','Milwaukee Brewers':'MIL','Washington Nationals':'WAS','Chicago Cubs':'CHC','Minnesota Twins':'MIN','Baltimore Orioles':'BAL','Boston Red Sox':'BOS','Cincinnati Reds':'CIN','Los Angeles Angels':'LAA','Houston Astros':'HOU','Tampa Bay Rays':'TB','St. Louis Cardinals':'STL','Texas Rangers':'TEX','Philadelphia Phillies':'PHI','Detroit Tigers':'DET','San Diego Padres':'SD','Los Angeles Dodgers':'LAD','Arizona Diamondbacks':'ARI','Seattle Mariners':'SEA','Cleveland Guardians':'CLE','New York Yankees':'NYY','Toronto Blue Jays':'TOR','Atlanta Braves':'ATL','Colorado Rockies':'COL','San Francisco Giants':'SF','Kansas City Royals':'KC','Oakland Athletics':'OAK','Miami Marlins':'MIA'};
function o2p(o){if(!o)return 0;return o>0?100/(o+100):Math.abs(o)/(Math.abs(o)+100);}
function gO(r){return Number(r?.winRunnerOdds?.americanDisplayOdds?.americanOdds)||0;}
function norm(n){return n.toLowerCase().replace(/\./g,'').replace(/jr\.?$/i,'').replace(/\s+/g,' ').trim();}
function fm(n,m){if(m.has(n))return m.get(n);const nn=norm(n);for(const[k,v]of m){if(norm(k)===nn)return v;}const l=nn.split(' ').pop();if(l&&l.length>=4){for(const[k,v]of m){if(norm(k).split(' ').pop()===l)return v;}}return null;}
const BM={'PLAYER_TO_RECORD_A_HIT':'hit_odds','PLAYER_TO_RECORD_2+_HITS':'hits_2plus','PLAYER_TO_RECORD_3+_HITS':'hits_3plus','PLAYER_TO_RECORD_4+_HITS':'hits_4plus','TO_HIT_A_SINGLE':'single_odds','TO_HIT_A_DOUBLE':'double_odds','TO_HIT_A_TRIPLE':'triple_odds','TO_HIT_A_HOME_RUN':'hr_odds','TO_HIT_2+_HOME_RUNS':'hr_2plus','TO_RECORD_2+_TOTAL_BASES':'tb_2plus','TO_RECORD_3+_TOTAL_BASES':'tb_3plus','TO_RECORD_4+_TOTAL_BASES':'tb_4plus','TO_RECORD_5+_TOTAL_BASES':'tb_5plus','TO_RECORD_AN_RBI':'rbi_odds','TO_RECORD_2+_RBIS':'rbis_2plus','TO_RECORD_3+_RBIS':'rbis_3plus','TO_RECORD_4+_RBIS':'rbis_4plus','TO_RECORD_A_RUN':'run_odds','TO_RECORD_2+_RUNS':'runs_2plus','TO_RECORD_3+_RUNS':'runs_3plus','TO_RECORD_A_STOLEN_BASE':'sb_odds','TO_RECORD_2+_STOLEN_BASES':'sbs_2plus','PLAYER_TO_RECORD_1+_HITS+RUNS+RBIS':'hrr_1plus','PLAYER_TO_RECORD_2+_HITS+RUNS+RBIS':'hrr_2plus','PLAYER_TO_RECORD_3+_HITS+RUNS+RBIS':'hrr_3plus','PLAYER_TO_RECORD_4+_HITS+RUNS+RBIS':'hrr_4plus'};

async function scrapeRG(){
  console.log('Scraping RotoGrinders...');
  const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome-stable',headless:true,args:['--no-sandbox','--disable-setuid-sandbox']});
  const pg=await b.newPage();await pg.setUserAgent(UA);
  await pg.goto('https://rotogrinders.com/lineups/mlb?site=fanduel',{waitUntil:'networkidle2',timeout:25000});
  await new Promise(r=>setTimeout(r,3000));
  const t=await pg.evaluate(()=>document.body.innerText);await b.close();
  const lines=t.split('\n').map(l=>l.trim()).filter(l=>l);

  // City-to-abbreviation map
  const CITY_MAP={'PITTSBURGH':'PIT','NEW YORK':'NYM','CHICAGO':'CHC','MILWAUKEE':'MIL',
    'WASHINGTON':'WAS','MINNESOTA':'MIN','BALTIMORE':'BAL','BOSTON':'BOS','CINCINNATI':'CIN',
    'LOS ANGELES':'LAA','HOUSTON':'HOU','TAMPA BAY':'TB','ST. LOUIS':'STL','TEXAS':'TEX',
    'PHILADELPHIA':'PHI','DETROIT':'DET','SAN DIEGO':'SD','ARIZONA':'ARI','SEATTLE':'SEA',
    'CLEVELAND':'CLE','TORONTO':'TOR','ATLANTA':'ATL','COLORADO':'COL','SAN FRANCISCO':'SF',
    'KANSAS CITY':'KC','OAKLAND':'OAK','MIAMI':'MIA'};
  // Team name disambiguation (when city appears for multiple teams)
  const TEAM_NAME_MAP={'METS':'NYM','YANKEES':'NYY','CUBS':'CHC','WHITE SOX':'CWS',
    'ANGELS':'LAA','DODGERS':'LAD','PIRATES':'PIT','BREWERS':'MIL','NATIONALS':'WAS',
    'TWINS':'MIN','ORIOLES':'BAL','RED SOX':'BOS','REDS':'CIN','ASTROS':'HOU',
    'RAYS':'TB','CARDINALS':'STL','RANGERS':'TEX','PHILLIES':'PHI','TIGERS':'DET',
    'PADRES':'SD','DIAMONDBACKS':'ARI','MARINERS':'SEA','GUARDIANS':'CLE','BLUE JAYS':'TOR',
    'BRAVES':'ATL','ROCKIES':'COL','GIANTS':'SF','ROYALS':'KC','ATHLETICS':'OAK','MARLINS':'MIA'};

  // Parse: find game headers, then assign teams to players between headers
  // Game header pattern: "TIME ET" then "CITY" then "TEAM_NAME" then "CITY" then "TEAM_NAME"
  const games = []; // {lineIdx, away, home}
  for(let i=0;i<lines.length-4;i++){
    if(lines[i].match(/^\d{1,2}:\d{2}\s*(AM|PM)\s*ET$/i)){
      const city1=lines[i+1];const name1=lines[i+2];const city2=lines[i+3];const name2=lines[i+4];
      const away=TEAM_NAME_MAP[name1]||CITY_MAP[city1]||'';
      const home=TEAM_NAME_MAP[name2]||CITY_MAP[city2]||'';
      if(away&&home)games.push({lineIdx:i,away,home});
    }
  }

  // Now parse players and assign teams based on position between game headers
  const players=[];
  let currentAway='',currentHome='',teamState='awayPitcher'; // awayPitcher->awayBatters->homePitcher->homeBatters
  let gameIdx=0;

  for(let i=0;i<lines.length;i++){
    // Check if we've hit a new game header
    if(gameIdx<games.length&&i>=games[gameIdx].lineIdx){
      currentAway=games[gameIdx].away;currentHome=games[gameIdx].home;
      teamState='awayPitcher';gameIdx++;
      continue;
    }

    const line=lines[i];
    // Batters: "Name (L/R/S) POS/POS $X.XK"
    const m1=line.match(/^(.+?)\s+\([LRS]\)\s+([\w\/]+)\s+\$([\d.]+)K$/i);
    if(m1){
      const isAway=teamState==='awayPitcher'||teamState==='awayBatters';
      const team=isAway?currentAway:currentHome;
      const opp=isAway?currentHome:currentAway;
      players.push({name:m1[1].trim(),position:m1[2].split('/')[0],salary:Math.round(parseFloat(m1[3])*1000),team,opponent:opp});
      if(teamState==='awayPitcher')teamState='awayBatters';
      if(teamState==='homePitcher')teamState='homeBatters';
      continue;
    }
    // Pitchers: "Name" then "(L/R/S) P $X.XK" on next line
    if(i+1<lines.length){
      const nx=lines[i+1];
      const m2=nx.match(/^\([LRS]\)\s+P\s+\$([\d.]+)K$/i);
      if(m2&&line.length>3&&!line.match(/^\d/)&&!line.includes('O/U')&&!line.includes('$')&&!line.includes('%')&&!line.match(/^[A-Z]{2,}$/)){
        // Second pitcher in a game = switch to home team
        // (first pitcher is away, second is home)
        // awayPitcher = this is the away pitcher
        // awayBatters = we just finished away batters, so this is the HOME pitcher
        const isAway=teamState==='awayPitcher';
        const team=isAway?currentAway:currentHome;
        const opp=isAway?currentHome:currentAway;
        players.push({name:line,position:'P',salary:Math.round(parseFloat(m2[1])*1000),team,opponent:opp});
        if(teamState==='awayPitcher')teamState='awayBatters';
        else teamState='homeBatters';
        i++;continue;
      }
    }
  }

  console.log(`  RG: ${players.length} players`);return players;
}

async function scrapeDFF(){
  console.log('Scraping DFF...');
  const r=await fetch('https://www.dailyfantasyfuel.com/mlb/projections/fanduel',{headers:{'User-Agent':UA}});
  const h=await r.text();
  const t=h.replace(/<script[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,'\n').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').split('\n').map(l=>l.trim()).filter(l=>l).join('\n');
  const p=new Map();let m;
  const pr=/(?:^|\n)P\n([\w][\w\s.'-]+?)\s*(?:DTD\s*)?\n?\u2022\s*\([LRS]\)\n\$\n?([\d.]+)k\n(?:YES|EXP\.)\n(\w{2,3})\n(\w{2,3})\n([\d.]+)/gm;
  while((m=pr.exec(t)))p.set(m[1].trim(),{team:m[3],opponent:m[4]});
  const br=/(?:^|\n)(C(?:\/OF)?|1B(?:\/1B)?|2B(?:\/(?:SS|OF|2B))?|3B(?:\/(?:2B|3B))?|SS(?:\/SS)?|OF(?:\/OF)?)\n([\w][\w\s.'-]+?)\s*(?:DTD\s*)?\n?\u2022\s*\([LRS]\)\n\$\n?([\d.]+)k\n(?:YES|EXP\.)\n(\w{2,3})\n(\w{2,3})\n(\d+)\s*(?:\u2713)?\n([\d.]+)/gm;
  while((m=br.exec(t)))p.set(m[2].trim(),{team:m[4],opponent:m[5]});
  console.log(`  DFF: ${p.size} players`);return p;
}

async function getEvents(){
  const r=await fetch(`${FD_API}/content-managed-page?page=SPORT&eventTypeId=7511&_ak=${AK}&timezone=America/Chicago`,{headers:{'User-Agent':UA}});
  const d=await r.json();const ev=d?.attachments?.events||{};const today=new Date().toISOString().split('T')[0];
  return Object.entries(ev).filter(([,e])=>(e.openDate||'').startsWith(today)).map(([id,e])=>{
    const m=e.name.match(/^(.+?)\s*\(.+?\)\s*@\s*(.+?)\s*\(.+?\)$/);
    return{id,away:m?(TA[m[1].trim()]||m[1].trim()):'',home:m?(TA[m[2].trim()]||m[2].trim()):''};
  });
}

async function getProps(eid){
  const pm=new Map();
  const g=(n)=>{const c=n.replace(/ (Over|Under)$/,'').trim();if(!c)return{};if(!pm.has(c))pm.set(c,{});return pm.get(c);};
  try{const r=await fetch(`${FD_API}/event-page?eventId=${eid}&tab=batter-props&_ak=${AK}`,{headers:{'User-Agent':UA}});const d=await r.json();
    for(const mk of Object.values(d?.attachments?.markets||{})){const f=BM[mk.marketType||''];if(!f)continue;for(const rn of(mk.runners||[])){const n=rn.runnerName||'';if(!n||n==='Over'||n==='Under')continue;g(n)[f]=gO(rn);}}
  }catch{}
  try{const r=await fetch(`${FD_API}/event-page?eventId=${eid}&tab=pitcher-props&_ak=${AK}`,{headers:{'User-Agent':UA}});const d=await r.json();
    for(const mk of Object.values(d?.attachments?.markets||{})){const mt=mk.marketType||'',mn=mk.marketName||'',rs=mk.runners||[];
      if(mt.match(/^PITCHER_[A-Z]_TOTAL_STRIKEOUTS$/)){const p=g(mn.replace(/ - Strikeouts$/,''));for(const rn of rs){if((rn.runnerName||'').includes('Over')){p.ks_line=Number(rn.handicap)||0;p.ks_over_odds=gO(rn);}}}
      if(mt.match(/^PITCHER_[A-Z]_STRIKEOUTS$/)){for(const rn of rs){const x=(rn.runnerName||'').match(/^(.+?)\s+(\d+)\+\s*Strikeouts$/);if(x){const p=g(x[1]);const t=parseInt(x[2]);if(t>=3&&t<=8)p[`ks_alt_${t}plus`]=gO(rn);}}}
      if(mt.match(/^PITCHING_SPECIALS/)){for(const rn of rs){const x=(rn.runnerName||'').match(/^(.+?)\s+(\d+)\+\s*Strikeouts$/);if(x){const p=g(x[1]);const t=parseInt(x[2]);if(t===9)p.ks_alt_9plus=gO(rn);if(t===10)p.ks_alt_10plus=gO(rn);}}}
      if(mt.match(/^PITCHER_[A-Z]_OUTS_RECORDED$/)){const p=g(mn.replace(/ Outs Recorded$/,''));for(const rn of rs){if(rn.runnerName==='Over'){p.outs_line=Number(rn.handicap)||0;p.outs_over_odds=gO(rn);}}}
    }
  }catch{}
  return pm;
}

function calcB(p){
  const hp=p.hit_odds?o2p(p.hit_odds):0.55,h2=p.hits_2plus?o2p(p.hits_2plus):hp*.25,h3=p.hits_3plus?o2p(p.hits_3plus):h2*.15;
  const sp=p.single_odds?o2p(p.single_odds):hp*.65,dp=p.double_odds?o2p(p.double_odds):hp*.15,tp=p.triple_odds?o2p(p.triple_odds):hp*.02,hrp=p.hr_odds?o2p(p.hr_odds):hp*.08;
  const t4=p.tb_4plus?o2p(p.tb_4plus):.08,t5=p.tb_5plus?o2p(p.tb_5plus):.03;
  const rp=p.rbi_odds?o2p(p.rbi_odds):.30,r2=p.rbis_2plus?o2p(p.rbis_2plus):rp*.25,r3=p.rbis_3plus?o2p(p.rbis_3plus):r2*.15;
  const rnp=p.run_odds?o2p(p.run_odds):.30,rn2=p.runs_2plus?o2p(p.runs_2plus):rnp*.20;
  const sbp=p.sb_odds?o2p(p.sb_odds):.05;
  const eH=(hp-h2)*1+(h2-h3)*2+h3*3;
  const tot=sp+dp+tp+hrp;const sf=tot>0?sp/tot:.65,df=tot>0?dp/tot:.18,tf=tot>0?tp/tot:.02,hf=tot>0?hrp/tot:.15;
  const hPts=eH*(sf*3+df*6+tf*9+hf*12);
  const eRBI=(rp-r2)*1+(r2-r3)*2+r3*3.5,eRun=(rnp-rn2)*1+rn2*2.2,eBB=hp*.25,eSB=sbp*.8;
  const proj=hPts+eRBI*3.5+eRun*3.2+eBB*3+eSB*6+.04*3;
  let bm=1.3;if(hrp>.15)bm+=.15;else if(hrp>.08)bm+=.08;if(h2>.35)bm+=.1;if(h3>.10)bm+=.1;if(t4>.10)bm+=.15;if(t5>.05)bm+=.1;if(r2>.15)bm+=.1;if(r3>.05)bm+=.1;if(sbp>.15)bm+=.1;
  return{projected:Math.round(proj*10)/10,upside:Math.round(proj*Math.min(bm,2.2)*10)/10};
}

function calcP(p){
  const kl=p.ks_line||5,kop=p.ks_over_odds?o2p(p.ks_over_odds):.5;
  // Expected Ks: use O/U line + lean. Also cross-check with alt tiers if available.
  let ek=kl+(kop-.5)*1.5;
  // If we have alt tiers, compute weighted expected from the ladder
  const kTiersE=[[3,p.ks_alt_3plus],[4,p.ks_alt_4plus],[5,p.ks_alt_5plus],[6,p.ks_alt_6plus],[7,p.ks_alt_7plus],[8,p.ks_alt_8plus],[9,p.ks_alt_9plus],[10,p.ks_alt_10plus]];
  const validTiers=kTiersE.filter(([,o])=>o).map(([k,o])=>[k,o2p(o)]);
  if(validTiers.length>=3){
    // E[K] ≈ sum of P(K+) for each tier (since K = sum of indicator variables for each threshold)
    let tierExp=0;for(const[,cp]of validTiers)tierExp+=cp;
    // Add base (below lowest tier)
    const lowestTier=validTiers[0][0];
    tierExp+=lowestTier-1; // assume ~100% chance of getting at least (lowest-1) Ks
    ek=Math.max(ek,tierExp*0.85); // slight discount, use whichever is higher
  }
  const ol=p.outs_line||16,oop=p.outs_over_odds?o2p(p.outs_over_odds):.5,eo=ol+(oop-.5)*2;
  const eIP=eo/3,eER=eIP*.4,wp=p.win_odds?o2p(p.win_odds):.45;
  const qp=eo>=18?.50:eo>=16?.35:eo>=14?.20:.10;
  const proj=ek*3+eo*1+eER*-3+wp*6+qp*4;
  // Upside Ks: walk the alt K ladder, find highest tier with >=20% cumulative prob
  let uk=kl+1;
  const kTiers=[[3,p.ks_alt_3plus],[4,p.ks_alt_4plus],[5,p.ks_alt_5plus],[6,p.ks_alt_6plus],[7,p.ks_alt_7plus],[8,p.ks_alt_8plus],[9,p.ks_alt_9plus],[10,p.ks_alt_10plus]];
  for(const[k,odds]of kTiers){if(odds&&o2p(odds)>=0.20)uk=k;}
  const uo=Math.min(ol+3,21),ue=Math.max(0,eER-1.5),uw=Math.min(1,wp+.15),uq=eIP>=4.5?Math.min(1,qp+.25):qp;
  return{projected:Math.round(proj*10)/10,upside:Math.round((uk*3+uo*1+ue*-3+uw*6+uq*4)*10)/10};
}

async function main(){
  const[rg,dff,evs]=await Promise.all([scrapeRG(),scrapeDFF(),getEvents()]);
  console.log(`Fetching props from ${evs.length} games...`);
  const allP=new Map();
  await Promise.all(evs.map(async e=>{const p=await getProps(e.id);for(const[n,d]of p)allP.set(n,d);}));
  console.log(`  Props: ${allP.size} players`);

  const ins=[];let noT=0;
  for(const r of rg){
    const d=fm(r.name,dff),pr=fm(r.name,allP)||{};
    // Use RG team data (real), fall back to DFF
    const team=r.team||d?.team||'',opp=r.opponent||d?.opponent||'';if(!team)noT++;
    const isP=r.position==='P';
    const pts=Object.keys(pr).length>0?(isP?calcP(pr):calcB(pr)):{projected:0,upside:0};
    ins.push({name:r.name,team,opponent:opp,position:r.position,salary:r.salary,...pr,
      projected_pts:pts.projected,upside_pts:pts.upside,
      pts_per_k:r.salary>0?Math.round((pts.upside/(r.salary/1000))*10)/10:0,slate_id:'main'});
  }

  if(noT>0){
    console.log(`  ${noT} without teams, backfilling from prop context...`);
    for(const ev of evs){
      const ep=await getProps(ev.id);
      for(const[pn]of ep){
        const i=ins.find(x=>!x.team&&norm(x.name)===norm(pn));
        if(i){i.team=ev.away;i.opponent=ev.home;}
      }
    }
    console.log(`  Still missing: ${ins.filter(p=>!p.team).length}`);
  }

  // Normalize: ensure all objects have identical keys
  const allKeys = new Set();
  for (const p of ins) for (const k of Object.keys(p)) allKeys.add(k);
  for (const p of ins) for (const k of allKeys) if (!(k in p)) p[k] = null;
  console.log(`Inserting ${ins.length} players...`);
  const hd={'Authorization':`Bearer ${SUPABASE_KEY}`,'apikey':SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=minimal'};
  await fetch(`${SUPABASE_URL}/rest/v1/players?id=neq.00000000-0000-0000-0000-000000000000`,{method:'DELETE',headers:hd});
  for(let i=0;i<ins.length;i+=50){
    const res=await fetch(`${SUPABASE_URL}/rest/v1/players`,{method:'POST',headers:hd,body:JSON.stringify(ins.slice(i,i+50))});
    if(!res.ok)console.error(await res.text());
  }
  const wP=ins.filter(p=>p.tb_2plus||p.ks_line).length,wT=ins.filter(p=>p.team).length;
  console.log(`\n✅ ${ins.length} players | ${wT} w/team | ${wP} w/props | ${evs.length} games | $${Math.min(...ins.map(p=>p.salary))}-$${Math.max(...ins.map(p=>p.salary))}`);
}
main().catch(console.error);
