const A=[{organization:"Panacea",href:"https://panacea-tech.com/",position:"Chief Technology Officer",department:"Technology and Development",categories:["Work Experience","Startup"],date:"Nov 2024 - Present",location:"Austin, TX, USA",image:"/panacea.png",summary:"Leading full stack development of AI-medtech startup for improved outpatient care."},{organization:"The University of Texas at Austin",href:"https://www.cs.utexas.edu/",position:"Turing Scholars Honors Student",department:"Department of Computer Science",categories:["Education"],date:"Aug 2024 - Present",location:"2515 Speedway, Austin, TX 78712",image:"/utseal.png",summary:"Computer science honors student pursuing reasearch and career in compilers."},{organization:"Cinco Learning",position:"Computer Science Tutor",department:"Independent Contractor",categories:["Work Experience"],date:"Nov 2023 - Dec 2024",location:"Katy, TX, USA",summary:"Tutored high school computer science and USACO."},{organization:"EduBeyond",href:"https://edubeyond.org/",position:"Full Stack Developer",department:"Technology Team",categories:["Work Experience","Internship","Startup"],date:"Mar 2023 - Feb 2024",location:"Vancouver, Canada",image:"https://edubeyond.ai/logos/logo_transparent_inline.png",summary:"Implemented full stack aspects of messaging, authentication, and AI integration."},{organization:"The University of Houston",href:"https://rpglab.github.io/",position:"Research Assistant",department:"Renewable Power Grid Lab",categories:["Work Experience","Research"],date:"Dec 2022 - Dec 2023",location:"Houston, TX, USA",image:"https://rpglab.github.io/images/Logo_RPGLab.png",summary:"Conducted and modified experiments using neural networks to forecast power grid loads."}],v=[{organization:"Concurrency Libraries",categories:["Multiprocess","Multithread","Libraries"],date:"Feb 2025 - Mar 2025",summary:"A collection of C libraries for memory allocation and coroutine orchestration in multiprocess (via shared mmap memory) and multithread processes."},{organization:"Fun-Lang",categories:["Programming Language","Compiler","Interpreter"],date:"Feb 2025",summary:"A toy programming language (small subset of Python) where I experimented with just-in-time compilation and various compiler optimizations."},{organization:"ARM64 decomplier and emulator",categories:["Assembly"],date:"Feb 2025",summary:"A toy emulator that can emulate and output human-readable assembly for ARM64 on x64 devices."},{organization:"Monomer",href:"https://monomer.dev/",categories:["Programming Language","Compiler","Interpreter"],date:"Nov 2020 - Present",summary:"General purpose programming language."},{organization:"Esindeen",href:"https://esindeen.com/",categories:["Web app","Cloud"],date:"Feb 2024 - Present",summary:"Online college application essay tracker."},{organization:"MERL",href:"https://sites.google.com/view/meerl",categories:["Programming Language","Preprocessor","Interpreter"],date:"May 2020 - Nov 2020",summary:"General purpose programming language."},{organization:"Fermi Guesser",href:"https://jzhyang.com/old/games/fermi.html",categories:["Web app"],date:"Jan 2023 - May 2023",summary:"Science Olympiad memorization tool."},{organization:"Forbidden Island",href:"https://jzhyang.com/old/ForbiddenIsland.html",categories:["Game","Java Swing"],date:"Sept 2022 - Dec 2022",summary:"High school."},{organization:"Snake Game",href:"https://jzhyang.com/old/games/snake/TraditionalSnake.html",categories:["Game","Web app"],date:"Sept 2023",summary:"High school web game project."},{organization:"Autoschedule",date:"Jan 2020",categories:["Windows Desktop Application","Scripting language"],summary:"Fully native Windows command bundler for temporal organization."}],f={bio:A,projects:v};let d=[];const z=document.getElementById("topbar"),k=document.getElementById("shell-content"),u=document.getElementById("output"),s=document.getElementById("command-input"),E=document.getElementById("shell-form"),h=document.getElementById("current-path"),g=a=>{const e=a.startsWith("/")?[]:new Array(...d);for(const o of a.split("/").filter(Boolean)){const t=e.reduce((c,n)=>c[n],f);if(o===".."&&e.length>0)e.pop();else if(o!==".")if(Object.keys(t).includes(o)&&typeof t[o]=="object")e.push(o);else return null}return e},y=a=>a.reduce((e,o)=>Array.isArray(e)?e.find(t=>t.organization===o):typeof e=="object"?e[o]:"",f),S=a=>{if(!(u&&s&&z&&h)){console.log("missing an element");return}const e=a.split(" "),o=e[0],t=e.slice(1);switch(o){case"echo":r(t.join(" "));break;case"ls":{const n=t.length?g(t[0]):d;if(n){const i=y(n);r((Array.isArray(i)?i.map(m=>m.organization):Object.keys(i)).join(" "))}else r(`ls ${t[0]}: No such directory`);break}case"cat":{const n=t[0],i=n.substring(n.lastIndexOf("/")+1),m=g(n.substring(0,n.lastIndexOf("/"))),p=m?y(m):{},l=Array.isArray(p)?p.find(b=>b.organization===i):p[i];r(l?typeof l=="object"?JSON.stringify(l):l.toString():`cat ${t[0]}: No such file or directory`);break}case"cd":const c=g(t[0]);c?(d=c,h.textContent=`/${d.join("/")} $ `):r(`cd ${t[0]}: No such file or directory`);break;case"clear":u?.replaceChildren();break;default:r(`${o}: command not found`)}},r=a=>{const e=document.createElement("div");e.textContent=a,u?.appendChild(e)};E?.addEventListener("submit",a=>{a.preventDefault();const e=s?.value;S(e),s&&(s.value="")});k?.addEventListener("click",a=>{a.preventDefault(),s.focus()});
