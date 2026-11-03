import { authLogin, authSetup, authStatus, type AuthSnapshot, type AuthStateName } from "./auth.ts";
import { errorText } from "./hosts.ts";
import { t } from "./locales/login.ts";

/**
 * Login or first-run setup. The secret field is masked, cleared on submit,
 * and is not written to localStorage or the console.
 */
export function mountLogin(parent: HTMLElement, onUnlocked: () => void): void {
  const panel = document.createElement("section");
  panel.className = "login-panel";

  const title = document.createElement("h1");
  title.className = "title";
  title.textContent = "Starhop";

  const heading = document.createElement("h2");
  heading.className = "section-title";

  const form = document.createElement("form");
  form.className = "form login-form";
  const usernameInput = labeledInput(form, t("username"), "username", false);
  const secretInput = labeledInput(form, t("password"), "current-secret", true);
  const confirmInput = labeledInput(form, t("passwordAgain"), "new-secret", true);

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "button primary";
  form.append(submit);

  const error = document.createElement("p");
  error.className = "form-error";
  error.setAttribute("role", "alert");

  const countdown = document.createElement("p");
  countdown.className = "login-hint";
  countdown.setAttribute("role", "status");
  countdown.setAttribute("aria-live", "polite");

  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "button";
  retry.textContent = t("retry");
  retry.hidden = true;

  panel.append(title, heading, form, error, countdown, retry);
  parent.append(panel);

  let mode: AuthStateName = "locked";
  let timer = 0;
  let throttled = false;

  retry.addEventListener("click", () => {
    void refresh();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (throttled || submit.disabled) {
      return;
    }
    const username = usernameInput.value;
    const secret = secretInput.value;
    const confirm = confirmInput.value;
    secretInput.value = "";
    confirmInput.value = "";
    void send(username, secret, confirm);
  });

  void refresh();

  async function refresh(): Promise<void> {
    let snapshot: AuthSnapshot;
    try {
      snapshot = await authStatus();
    } catch (err) {
      snapshot = {
        state: "unavailable",
        retryAfterMs: 0,
        message: errorText(err) || t("credentialStoreUnavailable"),
      };
    }
    apply(snapshot);
  }

  function apply(snapshot: AuthSnapshot): void {
    if (snapshot.state === "unlocked") {
      panel.hidden = true;
      onUnlocked();
      return;
    }
    mode = snapshot.state;
    const setup = snapshot.state === "needsSetup";
    const unavailable = snapshot.state === "unavailable";
    heading.textContent = setup
      ? t("setupHeading")
      : unavailable
        ? t("unavailableHeading")
        : t("login");
    form.hidden = unavailable;
    retry.hidden = !unavailable;
    confirmInput.parentElement?.toggleAttribute("hidden", !setup);
    confirmInput.required = setup;
    usernameInput.required = !unavailable;
    secretInput.required = !unavailable;
    submit.textContent = setup ? t("finishSetup") : t("login");
    error.textContent = snapshot.message ?? "";
    armThrottle(snapshot.retryAfterMs);
  }

  async function send(username: string, secret: string, confirm: string): Promise<void> {
    error.textContent = "";
    submit.disabled = true;
    try {
      const snapshot =
        mode === "needsSetup"
          ? await authSetup(username, secret, confirm)
          : await authLogin(username, secret);
      if (snapshot.state === "unlocked") {
        panel.hidden = true;
        onUnlocked();
        return;
      }
      apply(snapshot);
    } catch (err) {
      error.textContent = errorText(err);
      try {
        const snapshot = await authStatus();
        if (snapshot.state === "unlocked") {
          panel.hidden = true;
          onUnlocked();
          return;
        }
        armThrottle(snapshot.retryAfterMs);
        if (snapshot.state === "unavailable") {
          apply(snapshot);
        }
      } catch {
        error.textContent = t("credentialStoreUnavailable");
      }
    } finally {
      secretInput.value = "";
      confirmInput.value = "";
      if (!throttled) {
        submit.disabled = false;
      }
    }
  }

  function armThrottle(retryAfterMs: number): void {
    window.clearTimeout(timer);
    timer = 0;
    if (retryAfterMs <= 0) {
      throttled = false;
      countdown.textContent = "";
      submit.disabled = false;
      return;
    }
    throttled = true;
    submit.disabled = true;
    const endsAt = Date.now() + retryAfterMs;
    const tick = (): void => {
      const left = endsAt - Date.now();
      if (left <= 0) {
        throttled = false;
        countdown.textContent = "";
        submit.disabled = false;
        timer = 0;
        return;
      }
      countdown.textContent = t("wait", { n: Math.ceil(left / 1000) });
      timer = window.setTimeout(tick, 200);
    };
    tick();
  }
}

export type CredentialMode = "setup" | "verify";

/**
 * Username plus a masked secret, used when the lock switch needs setup or a check.
 * The secret is cleared on submit and is not written to localStorage or the console.
 */
export function mountCredentialPrompt(
  parent: HTMLElement,
  mode: CredentialMode,
  onSubmit: (username: string, secret: string, confirm: string) => Promise<void>,
  onCancel: () => void,
): { close: () => void } {
  const box = document.createElement("div");
  box.className = "settings-prompt";

  const heading = document.createElement("h3");
  heading.className = "section-title";
  heading.textContent = mode === "setup" ? t("promptSetup") : t("promptVerify");

  const form = document.createElement("form");
  form.className = "form login-form";
  const usernameInput = labeledInput(form, t("username"), "username", false);
  const secretInput = labeledInput(form, t("secret"), "current-secret", true);
  const confirmInput = labeledInput(form, t("secretAgain"), "new-secret", true);
  const setup = mode === "setup";
  confirmInput.parentElement?.toggleAttribute("hidden", !setup);
  confirmInput.required = setup;
  usernameInput.required = true;
  secretInput.required = true;

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "button primary";
  submit.textContent = setup ? t("finishSetup") : t("confirmOff");
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "button";
  cancel.textContent = t("cancel");
  const actions = document.createElement("div");
  actions.className = "settings-actions";
  actions.append(submit, cancel);
  form.append(actions);

  const error = document.createElement("p");
  error.className = "form-error";
  error.setAttribute("role", "alert");

  const countdown = document.createElement("p");
  countdown.className = "login-hint";
  countdown.setAttribute("role", "status");
  countdown.setAttribute("aria-live", "polite");

  box.append(heading, form, error, countdown);
  parent.append(box);

  let timer = 0;
  let throttled = false;
  let closed = false;

  cancel.addEventListener("click", () => {
    close();
    onCancel();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (throttled || submit.disabled) {
      return;
    }
    const username = usernameInput.value;
    const secret = secretInput.value;
    const confirm = confirmInput.value;
    secretInput.value = "";
    confirmInput.value = "";
    void send(username, secret, confirm);
  });

  return { close };

  function close(): void {
    if (closed) {
      return;
    }
    closed = true;
    window.clearTimeout(timer);
    secretInput.value = "";
    confirmInput.value = "";
    box.remove();
  }

  async function send(username: string, secret: string, confirm: string): Promise<void> {
    error.textContent = "";
    submit.disabled = true;
    try {
      await onSubmit(username, secret, confirm);
    } catch (err) {
      error.textContent = errorText(err);
      try {
        const snapshot = await authStatus();
        armThrottle(snapshot.retryAfterMs);
      } catch {
        if (error.textContent === "") {
          error.textContent = t("credentialStoreUnavailable");
        }
      }
    } finally {
      secretInput.value = "";
      confirmInput.value = "";
      if (!closed && !throttled) {
        submit.disabled = false;
      }
    }
  }

  function armThrottle(retryAfterMs: number): void {
    window.clearTimeout(timer);
    timer = 0;
    if (retryAfterMs <= 0) {
      throttled = false;
      countdown.textContent = "";
      if (!closed) {
        submit.disabled = false;
      }
      return;
    }
    throttled = true;
    submit.disabled = true;
    const endsAt = Date.now() + retryAfterMs;
    const tick = (): void => {
      const left = endsAt - Date.now();
      if (left <= 0) {
        throttled = false;
        countdown.textContent = "";
        if (!closed) {
          submit.disabled = false;
        }
        timer = 0;
        return;
      }
      countdown.textContent = t("wait", { n: Math.ceil(left / 1000) });
      timer = window.setTimeout(tick, 200);
    };
    tick();
  }
}

function labeledInput(
  form: HTMLFormElement,
  labelText: string,
  name: string,
  masked: boolean,
): HTMLInputElement {
  const label = document.createElement("label");
  label.className = "field";
  const caption = document.createElement("span");
  caption.className = "field-label";
  caption.textContent = labelText;
  const input = document.createElement("input");
  input.name = name;
  input.type = masked ? "password" : "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  label.append(caption, input);
  form.append(label);
  return input;
}
