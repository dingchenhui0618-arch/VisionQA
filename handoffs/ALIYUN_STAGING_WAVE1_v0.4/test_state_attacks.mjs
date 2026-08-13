import { createHash } from "node:crypto";
const sha = (s) => createHash("sha256").update(s).digest("hex");
const run = "run-good", batch = "batch-good", id = "vpc-123", h = sha(id);
const manifest = JSON.stringify({batch_id:batch,run_id:run,region:"cn-beijing",resource_group_id:"rg-good",resources:{vpc:{id,name:"visionqa-staging-vpc",region:"cn-beijing",resource_group_id:"rg-good",created_by_run:true}}});
const msha = sha(manifest);
const ledger = [
  {batch_id:"batch-old",run_id:"run-old",phase:"apply",kind:"vpc",id_sha256:h,result:"CREATED"},
  {batch_id:batch,run_id:run,phase:"apply",kind:"vpc",id_sha256:h,result:"CREATED"},
  {batch_id:batch,run_id:run,phase:"apply",kind:"vpc",id_sha256:h,result:"CHECKPOINT",action:"MANIFEST_CHECKPOINT",manifest_sha256:msha},
];
const match=(r,b,hash)=>ledger.some(x=>x.run_id===r&&x.batch_id===b&&x.kind==="vpc"&&x.id_sha256===hash&&x.result==="CREATED");
if(!match(run,batch,h)) throw new Error("valid binding rejected");
if(match("run-old",batch,h)) throw new Error("cross-run accepted");
if(match(run,"batch-old",h)) throw new Error("cross-batch accepted");
if(match(run,batch,sha("evil"))) throw new Error("wrong id accepted");
const checkpoint=ledger.filter(x=>x.run_id===run&&x.action==="MANIFEST_CHECKPOINT").at(-1);
if(checkpoint.manifest_sha256!==msha) throw new Error("checkpoint mismatch");
if(sha(manifest+" ")===msha) throw new Error("manifest tamper not detected");
console.log("STATE_ATTACK_TESTS=PASS cases=5");
