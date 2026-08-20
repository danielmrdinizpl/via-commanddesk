import { NextResponse } from "next/server";
import { POST as createTask, GET as listTasks } from "../../tasks/route.js";
import { PATCH as updateTask } from "../../tasks/[id]/route.js";
import { q } from "../../../../lib/db.js";
import { demoModeEnabled } from "../../../../lib/auth.js";

const PROJECT_COMERCIAL = "10000000-0000-0000-0000-000000000001";
const PROJECT_ATLAS = "10000000-0000-0000-0000-000000000002";
const MARIANA = "00000000-0000-0000-0000-000000000102";
const RAFAEL = "00000000-0000-0000-0000-000000000103";
const INVALID_ID = "99999999-9999-4999-8999-999999999999";

export async function GET() {
  if (!demoModeEnabled()) {
    return NextResponse.json({ ok: false, error: "Self-test disponível apenas no modo demo." }, { status: 403 });
  }

  let taskId = null;
  const marker = `SELFTEST-ASSIGN-${Date.now()}`;

  try {
    const createRequest = new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: marker,
        description: "Homologação temporária de projeto e responsável",
        status: "A Fazer",
        priority: "Média",
        department: "Comercial",
        projectId: PROJECT_COMERCIAL,
        ownerId: MARIANA
      })
    });
    const createResponse = await createTask(createRequest);
    const created = await createResponse.json();
    if (createResponse.status !== 201 || !created.id || created.project_id !== PROJECT_COMERCIAL || created.owner_id !== MARIANA) {
      return NextResponse.json({ ok: false, stage: "create_assignment", status: createResponse.status, response: created }, { status: 500 });
    }
    taskId = created.id;

    const patchRequest = new Request(`http://localhost/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: PROJECT_ATLAS,
        owner_id: RAFAEL,
        status: "Em Andamento",
        priority: "Alta"
      })
    });
    const patchResponse = await updateTask(patchRequest, { params: Promise.resolve({ id: taskId }) });
    const patched = await patchResponse.json();
    if (patchResponse.status !== 200 || patched.project_id !== PROJECT_ATLAS || patched.owner_id !== RAFAEL) {
      return NextResponse.json({ ok: false, stage: "patch_assignment", status: patchResponse.status, response: patched }, { status: 500 });
    }

    const listResponse = await listTasks(new Request("http://localhost/api/tasks"));
    const listed = await listResponse.json();
    const reloaded = Array.isArray(listed) ? listed.find((task) => task.id === taskId) : null;
    if (!reloaded || reloaded.project_name !== "Projeto Atlas" || reloaded.owner_name !== "Rafael Silva" || reloaded.status !== "Em Andamento") {
      return NextResponse.json({ ok: false, stage: "reload_assignment", response: reloaded }, { status: 500 });
    }

    const invalidRequest = new Request(`http://localhost/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: INVALID_ID })
    });
    const invalidResponse = await updateTask(invalidRequest, { params: Promise.resolve({ id: taskId }) });
    const invalidBody = await invalidResponse.json();
    if (invalidResponse.status !== 400) {
      return NextResponse.json({ ok: false, stage: "tenant_guard", status: invalidResponse.status, response: invalidBody }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      stages: {
        createAssignment: true,
        patchAssignment: true,
        reloadNames: true,
        tenantGuard: true
      },
      task: {
        id: taskId,
        project: reloaded.project_name,
        owner: reloaded.owner_name,
        status: reloaded.status,
        priority: reloaded.priority
      }
    });
  } catch (error) {
    return NextResponse.json({ ok: false, stage: "exception", error: error.message }, { status: 500 });
  } finally {
    if (taskId) {
      await q("DELETE FROM activity WHERE task_id=$1", [taskId]).catch(() => null);
      await q("DELETE FROM tasks WHERE id=$1", [taskId]).catch(() => null);
    }
  }
}
