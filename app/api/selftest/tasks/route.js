import { NextResponse } from "next/server";
import { POST as createTask, GET as listTasks } from "../../tasks/route.js";
import { PATCH as updateTask } from "../../tasks/[id]/route.js";
import { q } from "../../../../lib/db.js";
import { demoModeEnabled } from "../../../../lib/auth.js";

export async function GET() {
  if (!demoModeEnabled()) {
    return NextResponse.json({ ok: false, error: "Self-test disponível apenas no modo demo." }, { status: 403 });
  }

  let taskId = null;
  const marker = `SELFTEST-${Date.now()}`;

  try {
    const createRequest = new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: marker,
        description: "Teste temporário ponta a ponta da API de tarefas",
        status: "A Fazer",
        priority: "Média",
        department: "Tecnologia",
        monitorOutlook: false
      })
    });

    const createdResponse = await createTask(createRequest);
    const created = await createdResponse.json();
    if (createdResponse.status !== 201 || !created.id) {
      return NextResponse.json({ ok: false, stage: "create", status: createdResponse.status, response: created }, { status: 500 });
    }
    taskId = created.id;

    const patchRequest = new Request(`http://localhost/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "Em Andamento", priority: "Alta" })
    });

    const patchedResponse = await updateTask(patchRequest, { params: Promise.resolve({ id: taskId }) });
    const patched = await patchedResponse.json();
    if (patchedResponse.status !== 200 || patched.status !== "Em Andamento" || patched.priority !== "Alta") {
      return NextResponse.json({ ok: false, stage: "patch", status: patchedResponse.status, response: patched }, { status: 500 });
    }

    const listResponse = await listTasks(new Request("http://localhost/api/tasks"));
    const listed = await listResponse.json();
    const reloaded = Array.isArray(listed) ? listed.find((task) => task.id === taskId) : null;
    if (!reloaded || reloaded.status !== "Em Andamento" || reloaded.priority !== "Alta") {
      return NextResponse.json({ ok: false, stage: "reload", response: reloaded || null }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      stages: { create: true, patch: true, reload: true, cleanup: "pending" },
      task: { id: taskId, title: marker, status: reloaded.status, priority: reloaded.priority }
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
