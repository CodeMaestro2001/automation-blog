"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Github,
  ImagePlus,
  Linkedin,
  LoaderCircle,
  LogOut,
  Send,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";

type Props = {
  linkedIn: { connected: boolean; name: string };
  githubConfigured: boolean;
  linkedInConfigured: boolean;
};

type PublishResult = {
  ok: boolean;
  postUrl?: string;
  results: Record<string, { ok: boolean; detail: string; url?: string }>;
};

const initialDraft = {
  content: "",
  tags: "",
  imageAlt: "",
};

function deriveArticle(content: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const titleIndex = lines.findIndex((line) => line.trim());
  if (titleIndex === -1) return { title: "", body: "", excerpt: "" };
  const title = lines[titleIndex].normalize("NFKC").replace(/\u3164/g, "").trim().replace(/^#{1,6}\s*/, "");
  const body = lines.slice(titleIndex + 1).join("\n").trim() || title;
  const blocks = body.normalize("NFKC").replace(/\u3164/g, "").trim().split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  const excerptSource = blocks.find((block) => !/^#|^📘|engineering notes/i.test(block) && block.length >= 35) || blocks[0] || title;
  const excerpt = excerptSource
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^[-*>]\s*/gm, "")
    .replace(/\*\*/g, "")
    .slice(0, 280)
    .trim();
  return { title, body, excerpt };
}

export function Publisher({ linkedIn: initialLinkedIn, githubConfigured, linkedInConfigured }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [publishWebsite, setPublishWebsite] = useState(true);
  const [publishLinkedIn, setPublishLinkedIn] = useState(true);
  const [linkedIn, setLinkedIn] = useState(initialLinkedIn);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<"article" | "linkedin">("article");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = localStorage.getItem("publisher-draft");
      if (saved) {
        try {
          const previous = JSON.parse(saved) as Record<string, string>;
          const content = previous.content || previous.linkedInCopy || [previous.title, previous.excerpt, previous.body].filter(Boolean).join("\n\n");
          setDraft({ content, tags: previous.tags || "", imageAlt: previous.imageAlt || "" });
        } catch { /* Ignore an invalid local draft. */ }
      }
      const params = new URLSearchParams(window.location.search);
      const linkedInError = params.get("linkedin_error");
      if (linkedInError) setError(linkedInError);
      if (params.has("linkedin") || linkedInError) window.history.replaceState({}, "", "/");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => localStorage.setItem("publisher-draft", JSON.stringify(draft)), 350);
    return () => window.clearTimeout(timer);
  }, [draft]);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  function update<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function selectImage(file?: File) {
    if (!file) return;
    if (!(["image/jpeg", "image/png"].includes(file.type))) {
      setError("Please choose a JPG or PNG image.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("The image must be smaller than 4 MB.");
      return;
    }
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPublishing(true);
    setResult(null);
    setError("");
    const form = new FormData();
    Object.entries(draft).forEach(([key, value]) => form.set(key, value));
    form.set("publishWebsite", String(publishWebsite));
    form.set("publishLinkedIn", String(publishLinkedIn));
    if (imageFile) form.set("image", imageFile);
    try {
      const response = await fetch("/api/publish", { method: "POST", body: form });
      const payload = (await response.json()) as PublishResult & { error?: string };
      if (payload.error) throw new Error(payload.error);
      setResult(payload);
      if (payload.ok) localStorage.removeItem("publisher-draft");
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Publishing failed.");
    } finally {
      setPublishing(false);
    }
  }

  async function disconnectLinkedIn() {
    const response = await fetch("/api/linkedin/disconnect", { method: "POST" });
    if (response.ok) setLinkedIn({ connected: false, name: "" });
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function clearDraft() {
    setDraft(initialDraft);
    setImageFile(null);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl("");
    setResult(null);
    localStorage.removeItem("publisher-draft");
  }

  const article = useMemo(() => deriveArticle(draft.content), [draft.content]);
  const paragraphs = useMemo(() => article.body.split(/\n\s*\n/).filter(Boolean), [article.body]);
  const tagList = draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean);

  return (
    <main className="publisher-shell">
      <header className="topbar">
        <a href="#composer" className="signal-brand"><span className="signal-mark">S</span><span><strong>Signal</strong><small>Publishing desk</small></span></a>
        <div className="topbar-actions">
          <span className="save-state"><Check size={14} /> Draft saved locally</span>
          <button className="icon-button" onClick={logout} title="Sign out"><LogOut size={17} /></button>
        </div>
      </header>

      <div className="publisher-grid">
        <form id="composer" className="composer" onSubmit={submit}>
          <div className="composer-heading">
            <div><p className="kicker">New dispatch</p><h1>Shape the idea.<br /><em>Send it everywhere.</em></h1></div>
            <span className="edition">No. {new Date().getFullYear()}</span>
          </div>

          <section className="form-section">
            <div className="section-title"><div><h2>LinkedIn edition</h2><p>Write once for both destinations. The first non-empty line becomes the article title and URL automatically.</p></div></div>
            <div className="field"><label htmlFor="content">Post copy &amp; article</label><textarea id="content" className="article-input" value={draft.content} onChange={(event) => update("content", event.target.value)} placeholder={"How Do Database Indexes Make SQL Queries Faster?\n\nWrite the complete post here…\n\nUse ## for headings and - for lists."} required maxLength={3000} /><span className="counter">{draft.content.length}/3000</span></div>
            <div className="two-fields">
              <div className="field"><label htmlFor="tags">Tags</label><input id="tags" value={draft.tags} onChange={(event) => update("tags", event.target.value)} placeholder="automation, engineering, AI" /><small>Separate with commas</small></div>
              <div className="field"><label htmlFor="imageAlt">Image description</label><input id="imageAlt" value={draft.imageAlt} onChange={(event) => update("imageAlt", event.target.value)} placeholder="Describe the image for accessibility" /></div>
            </div>
          </section>

          <section className="form-section media-section">
            <div className="section-title"><span>01</span><div><h2>Visual</h2><p>JPG or PNG · up to 4 MB · 1200 × 627 recommended</p></div></div>
            {imageUrl ? (
              <div className="image-selected"><Image unoptimized width={96} height={70} src={imageUrl} alt="Selected post preview" /><div><strong>{imageFile?.name}</strong><small>{imageFile ? `${(imageFile.size / 1024 / 1024).toFixed(2)} MB` : ""}</small></div><button type="button" onClick={() => { setImageFile(null); URL.revokeObjectURL(imageUrl); setImageUrl(""); }} aria-label="Remove image"><X size={18} /></button></div>
            ) : (
              <label className={`dropzone ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); selectImage(event.dataTransfer.files[0]); }}>
                <input type="file" accept="image/jpeg,image/png" onChange={(event) => selectImage(event.target.files?.[0])} />
                <span><ImagePlus size={21} /></span><strong>Drop your cover image here</strong><small>or click to browse</small>
              </label>
            )}
          </section>

          <section className="form-section destinations">
            <div className="section-title"><span>02</span><div><h2>Destinations</h2><p>Choose where this dispatch should go.</p></div></div>
            <label className={`destination-card ${publishWebsite ? "selected" : ""}`}>
              <input type="checkbox" checked={publishWebsite} onChange={(event) => setPublishWebsite(event.target.checked)} />
              <span className="destination-icon"><Github size={20} /></span><span><strong>Portfolio blog</strong><small>{githubConfigured ? "GitHub → Vercel" : "Needs GitHub setup"}</small></span><i>{publishWebsite && <Check size={15} />}</i>
            </label>
            <label className={`destination-card ${publishLinkedIn ? "selected" : ""}`}>
              <input type="checkbox" checked={publishLinkedIn} onChange={(event) => setPublishLinkedIn(event.target.checked)} />
              <span className="destination-icon linkedin-icon"><Linkedin size={20} /></span><span><strong>LinkedIn</strong><small>{linkedIn.connected ? `Connected as ${linkedIn.name}` : linkedInConfigured ? "Ready to connect" : "Needs OAuth setup"}</small></span><i>{publishLinkedIn && <Check size={15} />}</i>
            </label>
            <div className="connection-action">
              {linkedIn.connected ? <button type="button" className="text-button" onClick={disconnectLinkedIn}>Disconnect LinkedIn</button> : <a className={`connect-button ${!linkedInConfigured ? "disabled" : ""}`} href={linkedInConfigured ? "/api/linkedin/connect" : undefined}><Linkedin size={16} /> Connect LinkedIn</a>}
            </div>
          </section>

          {error && <div className="notice error-notice"><XCircle size={19} /><span>{error}</span></div>}
          {result && <div className={`notice ${result.ok ? "success-notice" : "warning-notice"}`}><CheckCircle2 size={19} /><div><strong>{result.ok ? "Published successfully" : "Published with an issue"}</strong>{Object.entries(result.results).map(([channel, channelResult]) => <p key={channel}><span>{channel}</span> — {channelResult.detail}{channelResult.url && <a href={channelResult.url} target="_blank" rel="noreferrer"> Open <ArrowUpRight size={12} /></a>}</p>)}</div></div>}

          <div className="publish-bar">
            <button type="button" className="clear-button" onClick={clearDraft}>Clear draft</button>
            <button type="submit" className="publish-button" disabled={publishing || (!publishWebsite && !publishLinkedIn) || (publishWebsite && !githubConfigured) || (publishLinkedIn && !linkedIn.connected)}>
              {publishing ? <LoaderCircle className="spin" size={19} /> : <Send size={18} />}{publishing ? "Publishing…" : "Publish dispatch"}
            </button>
          </div>
        </form>

        <aside className="preview-panel">
          <div className="preview-top"><div><Sparkles size={15} /><span>Live preview</span></div><div className="preview-tabs"><button type="button" className={preview === "article" ? "active" : ""} onClick={() => setPreview("article")}>Article</button><button type="button" className={preview === "linkedin" ? "active" : ""} onClick={() => setPreview("linkedin")}>LinkedIn</button></div></div>
          {preview === "article" ? (
            <article className="article-preview">
              {imageUrl ? <Image unoptimized width={1200} height={627} className="preview-cover" src={imageUrl} alt="" /> : <div className="preview-cover empty-cover"><span>Cover image</span></div>}
              <div className="preview-content">
                <div className="preview-meta"><span>Writing</span><span>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date())}</span></div>
                <h2>{article.title || "Your first line becomes the article title"}</h2>
                <p className="preview-excerpt">{article.excerpt || "The opening paragraph automatically becomes the article introduction."}</p>
                <div className="preview-body">{paragraphs.length ? paragraphs.slice(0, 5).map((paragraph, index) => paragraph.startsWith("## ") ? <h3 key={index}>{paragraph.slice(3)}</h3> : <p key={index}>{paragraph.replace(/^[-*] /gm, "• ")}</p>) : <><p>As you write, your article takes shape here.</p><p>The preview keeps the focus on rhythm, hierarchy, and readability.</p></>}</div>
                {tagList.length > 0 && <div className="preview-tags">{tagList.slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}</div>}
              </div>
            </article>
          ) : (
            <div className="linkedin-preview">
              <div className="li-author"><span>TR</span><div><strong>Tharusha Rathnayaka</strong><small>Software Engineer · Just now</small></div><ChevronDown size={18} /></div>
              <p>{draft.content || "Your LinkedIn post copy will appear here. Keep the first two lines strong—they earn the click."}</p>
              {imageUrl && <Image unoptimized width={1200} height={627} src={imageUrl} alt="" />}
              <div className="li-stats"><span>Be the first to react</span><span>0 comments</span></div>
              <div className="li-actions"><span>♡ Like</span><span>□ Comment</span><span>↗ Repost</span><span>➤ Send</span></div>
            </div>
          )}
          <p className="preview-note">Preview is indicative. LinkedIn and your portfolio may apply their own image crop.</p>
        </aside>
      </div>
    </main>
  );
}
