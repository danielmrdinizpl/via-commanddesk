import pg from "pg";
const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false }
});
await client.connect();

const ORG = "00000000-0000-0000-0000-000000000001";
const ADMIN = "00000000-0000-0000-0000-000000000101";
const MARIANA = "00000000-0000-0000-0000-000000000102";
const RAFAEL = "00000000-0000-0000-0000-000000000103";
const PROJ1 = "10000000-0000-0000-0000-000000000001";
const PROJ2 = "10000000-0000-0000-0000-000000000002";
const TASK1 = "20000000-0000-0000-0000-000000000001";
const TASK2 = "20000000-0000-0000-0000-000000000002";
const TASK3 = "20000000-0000-0000-0000-000000000003";
const TASK4 = "20000000-0000-0000-0000-000000000004";

await client.query("BEGIN");
try {
  await client.query(`
    INSERT INTO organizations (id,name,microsoft_tenant_id)
    VALUES ($1,'Via Networks Pilot','demo-via')
    ON CONFLICT (id) DO NOTHING
  `,[ORG]);

  for (const u of [
    [ADMIN, "pilot-admin", "pilot@via.local", "Administrador Pilot", "admin", "Diretoria", "Gestor"],
    [MARIANA, "pilot-mariana", "mariana@via.local", "Mariana Costa", "manager", "Comercial", "Gerente Comercial"],
    [RAFAEL, "pilot-rafael", "rafael@via.local", "Rafael Silva", "member", "Tecnologia", "Analista"]
  ]) {
    await client.query(`
      INSERT INTO users
      (id,organization_id,microsoft_oid,email,name,role,department,job_title)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (id) DO NOTHING
    `,[u[0],ORG,...u.slice(1)]);
  }

  await client.query(`
    INSERT INTO projects (id,organization_id,name,status,progress,owner_id)
    VALUES
      ($1,$3,'Expansão Comercial Q3','Em andamento',68,$4),
      ($2,$3,'Projeto Atlas','Em andamento',45,$5)
    ON CONFLICT (id) DO NOTHING
  `,[PROJ1,PROJ2,ORG,MARIANA,RAFAEL]);

  const dueTomorrow = new Date(Date.now()+86400000).toISOString().slice(0,10);
  const dueYesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);
  const due3 = new Date(Date.now()+3*86400000).toISOString().slice(0,10);

  const tasks = [
    [TASK1,"Criar proposta padrão Enterprise","Preparar proposta comercial e alinhar condição com a diretoria.","Em Andamento","Alta","Comercial",PROJ1,MARIANA,dueTomorrow,true,["acme","enterprise","proposta","contrato"],"@acme.com.br",""],
    [TASK2,"Homologar integração API","Concluir homologação técnica com fornecedor.","Bloqueada","Alta","Tecnologia",PROJ2,RAFAEL,dueYesterday,true,["api","homologacao","atlas"],"@parceiro.com.br",""],
    [TASK3,"Revisar política de desconto","Atualizar política comercial para novas propostas.","A Fazer","Média","Diretoria",PROJ1,ADMIN,due3,false,[],null,null],
    [TASK4,"Atualizar documentação técnica","Consolidar documentação do Projeto Atlas.","A Fazer","Média","Tecnologia",PROJ2,RAFAEL,due3,true,["documentacao","atlas"],"@parceiro.com.br",""]
  ];
  for (const t of tasks) {
    await client.query(`
      INSERT INTO tasks
      (id,organization_id,title,description,status,priority,department,project_id,owner_id,due_date,
       monitor_outlook,mail_keywords,mail_domain,mail_contact,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (id) DO NOTHING
    `,[t[0],ORG,...t.slice(1),ADMIN]);
  }

  await client.query(`
    INSERT INTO decisions
    (organization_id,task_id,title,detail,status,owner_id)
    SELECT $1,$2,'Aprovar condição comercial ACME','Definir limite de desconto para envio da proposta.','Pendente',$3
    WHERE NOT EXISTS (SELECT 1 FROM decisions WHERE organization_id=$1 AND task_id=$2 AND title='Aprovar condição comercial ACME')
  `,[ORG,TASK1,ADMIN]);

  await client.query(`
    INSERT INTO pending_items
    (organization_id,task_id,title,status,owner_id,due_date,origin)
    SELECT $1,$2,'Receber retorno do fornecedor','Aberta',$3,$4,'E-mail'
    WHERE NOT EXISTS (SELECT 1 FROM pending_items WHERE organization_id=$1 AND task_id=$2 AND title='Receber retorno do fornecedor')
  `,[ORG,TASK2,RAFAEL,dueYesterday]);

  await client.query("COMMIT");
  console.log("Seed concluído.");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}
