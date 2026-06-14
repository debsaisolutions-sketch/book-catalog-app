"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  identifyBookFromImage,
  identifyBookFromText,
  generateListingCopy,
} from "@/lib/anthropic";
import {
  getBarcodeDetector,
  isbnFromBarcode,
  isValidIsbn,
  normalizeIsbn,
} from "@/lib/isbn";
import {
  fetchBooks,
  insertBook,
  updateBookNote,
  deleteBook,
} from "@/lib/supabase";
import {
  getQueue,
  addToQueue,
  removeFromQueue,
  fileToBase64,
  getMediaType,
} from "@/lib/queue";
import type { Book, QueueItem } from "@/lib/types";

type Tab = "capture" | "queue" | "catalog";

const CONDITIONS = [
  "Like New",
  "Very Good",
  "Good",
  "Acceptable",
  "Poor",
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("capture");
  const [books, setBooks] = useState<Book[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [isbn, setIsbn] = useState("");
  const [condition, setCondition] = useState("Good");
  const [scanning, setScanning] = useState(false);
  const [scanSupported, setScanSupported] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const scanLoopRef = useRef<number | null>(null);

  const [modalContent, setModalContent] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState("");
  const [noteBookId, setNoteBookId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const batchInputRef = useRef<HTMLInputElement>(null);
  const singleInputRef = useRef<HTMLInputElement>(null);

  const loadBooks = useCallback(async () => {
    try {
      const data = await fetchBooks();
      setBooks(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load books");
    }
  }, []);

  const refreshQueue = useCallback(() => {
    setQueue(getQueue());
  }, []);

  useEffect(() => {
    loadBooks();
    refreshQueue();
    setScanSupported(!!getBarcodeDetector());
  }, [loadBooks, refreshQueue]);

  useEffect(() => {
    if (!scanning) return;

    let stream: MediaStream | null = null;
    const detector = getBarcodeDetector();

    const startScanner = async () => {
      if (!detector || !videoRef.current) {
        setError("Barcode scanning not supported in this browser. Type the ISBN instead.");
        setScanning(false);
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const scan = async () => {
          if (!videoRef.current || !scanning) return;
          try {
            const codes = await detector.detect(videoRef.current);
            for (const code of codes) {
              const found = isbnFromBarcode(code.rawValue);
              if (found) {
                setIsbn(found);
                setScanning(false);
                setSuccess(`ISBN scanned: ${found}`);
                return;
              }
            }
          } catch {
            /* keep scanning */
          }
          scanLoopRef.current = requestAnimationFrame(scan);
        };
        scanLoopRef.current = requestAnimationFrame(scan);
      } catch {
        setError("Camera access denied. Allow camera or type the ISBN manually.");
        setScanning(false);
      }
    };

    startScanner();

    return () => {
      if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [scanning]);

  const sellTotal = useMemo(
    () =>
      books
        .filter((b) => b.recommendation === "SELL")
        .reduce((sum, b) => sum + (b.estimated_midpoint ?? 0), 0),
    [books]
  );

  const catalogStats = useMemo(() => {
    const sellCount = books.filter((b) => b.recommendation === "SELL").length;
    const donateCount = books.filter((b) => b.recommendation === "DONATE").length;
    const totalValue = books.reduce(
      (sum, b) => sum + (b.estimated_midpoint ?? 0),
      0
    );
    return { sellCount, donateCount, totalValue };
  }, [books]);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const saveBookToCatalog = async (
    identification: {
      title: string;
      author: string;
      category: string;
      estimated_value: string;
      estimated_midpoint: number;
      recommendation: "SELL" | "DONATE";
      rationale: string;
    },
    bookCondition: string
  ) => {
    await insertBook({
      title: identification.title,
      author: identification.author,
      category: identification.category,
      estimated_value: identification.estimated_value,
      estimated_midpoint: identification.estimated_midpoint,
      condition: bookCondition,
      condition_note: null,
      recommendation: identification.recommendation,
      rationale: identification.rationale,
    });
    await loadBooks();
  };

  const handleBatchPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    clearMessages();
    try {
      for (const file of Array.from(files)) {
        const base64 = await fileToBase64(file);
        addToQueue(base64);
      }
      refreshQueue();
      setSuccess(`Added ${files.length} photo(s) to queue`);
      setTab("queue");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add photos to queue");
    }
  };

  const handleSinglePhoto = async (file: File | null) => {
    if (!file) return;
    clearMessages();
    setLoading(true);
    try {
      const base64 = await fileToBase64(file);
      const mediaType = getMediaType(file);
      const result = await identifyBookFromImage(base64, mediaType, condition);
      await saveBookToCatalog(result, condition);
      setSuccess(`Added "${result.title}" to catalog`);
      setTab("catalog");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Identification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleTextLookup = async () => {
    if (!title.trim()) {
      setError("Please enter a title");
      return;
    }
    clearMessages();
    setLoading(true);
    try {
      const result = await identifyBookFromText(
        title.trim(),
        author.trim() || "Unknown",
        condition
      );
      await saveBookToCatalog(result, condition);
      setSuccess(`Added "${result.title}" to catalog`);
      setTitle("");
      setAuthor("");
      setTab("catalog");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Lookup failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleIsbnLookup = async () => {
    const clean = normalizeIsbn(isbn);
    if (!isValidIsbn(clean)) {
      setError("Enter a valid 10- or 13-digit ISBN");
      return;
    }
    clearMessages();
    setLoading(true);
    try {
      const response = await fetch("/api/lookup-isbn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isbn: clean, condition }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "ISBN lookup failed");
      }
      await loadBooks();
      setSuccess(`Added "${data.title}" to catalog`);
      setIsbn("");
      setTitle("");
      setAuthor("");
      setTab("catalog");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ISBN lookup failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const processQueueItem = async (item: QueueItem) => {
    clearMessages();
    setProcessingId(item.id);
    try {
      const result = await identifyBookFromImage(
        item.imageData,
        "image/jpeg",
        "Good"
      );
      await saveBookToCatalog(result, "Good");
      removeFromQueue(item.id);
      refreshQueue();
      setSuccess(`Identified "${result.title}" — moved to catalog`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Processing failed");
    } finally {
      setProcessingId(null);
    }
  };

  const handleGenerateListing = async (book: Book) => {
    clearMessages();
    setLoading(true);
    try {
      const copy = await generateListingCopy(book);
      setModalTitle("Listing Copy");
      setModalContent(copy);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate listing");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNote = async () => {
    if (!noteBookId) return;
    clearMessages();
    setLoading(true);
    try {
      await updateBookNote(noteBookId, noteText);
      await loadBooks();
      setNoteBookId(null);
      setNoteText("");
      setSuccess("Note saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save note");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this book from catalog?")) return;
    clearMessages();
    try {
      await deleteBook(id);
      await loadBooks();
      setSuccess("Book deleted");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Book Catalog</h1>
        <span className="header-total">
          Sell Total: ${sellTotal.toFixed(0)}
        </span>
      </header>

      <main className="main">
        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}

        {tab === "capture" && (
          <>
            <div className="card">
              <h2>Batch Photo Queue</h2>
              <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: 12 }}>
                Snap photos fast — process them later from the Queue tab.
              </p>
              <div
                className="capture-zone"
                onClick={() => batchInputRef.current?.click()}
              >
                <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>📷</div>
                Tap to add photos to queue
                <input
                  ref={batchInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  onChange={(e) => handleBatchPhotos(e.target.files)}
                />
              </div>
              {queue.length > 0 && (
                <p style={{ fontSize: "0.8rem", color: "var(--gold)" }}>
                  {queue.length} photo(s) in queue
                </p>
              )}
            </div>

            <div className="divider">or single lookup</div>

            <div className="card">
              <h2>Single Lookup</h2>

              <div className="field">
                <label>ISBN</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="9780140449136"
                  value={isbn}
                  onChange={(e) => setIsbn(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {scanSupported && (
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    onClick={() => {
                      clearMessages();
                      setScanning(true);
                    }}
                    disabled={loading}
                  >
                    Scan Barcode
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={handleIsbnLookup}
                  disabled={loading}
                >
                  Lookup by ISBN
                </button>
              </div>
              {!scanSupported && (
                <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: 12 }}>
                  Barcode scan works in Chrome/Edge on mobile. Type ISBN manually on other browsers.
                </p>
              )}

              <div className="divider">or photo / title</div>

              <div
                className="capture-zone"
                style={{ padding: "20px 16px", marginBottom: 16 }}
                onClick={() => !loading && singleInputRef.current?.click()}
              >
                <div style={{ fontSize: "1.2rem", marginBottom: 4 }}>📸</div>
                Photo lookup
                <input
                  ref={singleInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    handleSinglePhoto(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </div>

              <div className="field">
                <label>Title</label>
                <input
                  type="text"
                  placeholder="Book title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Author</label>
                <input
                  type="text"
                  placeholder="Author name"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Condition</label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                >
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="btn btn-primary"
                style={{ width: "100%" }}
                onClick={handleTextLookup}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner" />
                    Identifying...
                  </>
                ) : (
                  "Lookup by Title"
                )}
              </button>
            </div>
          </>
        )}

        {tab === "queue" && (
          <>
            {queue.length === 0 ? (
              <div className="empty">
                <p>No photos in queue</p>
                <p style={{ marginTop: 8 }}>
                  Add photos from the Capture tab to get started.
                </p>
              </div>
            ) : (
              <>
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--muted)",
                    marginBottom: 12,
                  }}
                >
                  Tap a photo to identify and move to catalog
                </p>
                <div className="queue-grid">
                  {queue.map((item) => (
                    <div
                      key={item.id}
                      className={`queue-thumb ${
                        processingId === item.id ? "processing" : ""
                      }`}
                      onClick={() =>
                        !processingId && processQueueItem(item)
                      }
                    >
                      <img
                        src={`data:image/jpeg;base64,${item.imageData}`}
                        alt="Queued book"
                      />
                      {processingId === item.id && (
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "rgba(0,0,0,0.5)",
                          }}
                        >
                          <span className="spinner" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {tab === "catalog" && (
          <>
            <div className="summary-bar">
              <div className="summary-stat sell">
                <div className="value">{catalogStats.sellCount}</div>
                <div className="label">Sell</div>
              </div>
              <div className="summary-stat donate">
                <div className="value">{catalogStats.donateCount}</div>
                <div className="label">Donate</div>
              </div>
              <div className="summary-stat total">
                <div className="value">
                  ${catalogStats.totalValue.toFixed(0)}
                </div>
                <div className="label">Total Value</div>
              </div>
            </div>

            {books.length === 0 ? (
              <div className="empty">
                <p>Catalog is empty</p>
                <p style={{ marginTop: 8 }}>
                  Capture or queue books to build your catalog.
                </p>
              </div>
            ) : (
              books.map((book) => (
                <div key={book.id} className="book-card">
                  <h3>{book.title}</h3>
                  <p className="author">{book.author ?? "Unknown author"}</p>
                  <div className="badges">
                    {book.category && (
                      <span className="badge badge-category">
                        {book.category}
                      </span>
                    )}
                    <span
                      className={`badge ${
                        book.recommendation === "SELL"
                          ? "badge-sell"
                          : "badge-donate"
                      }`}
                    >
                      {book.recommendation}
                    </span>
                  </div>
                  <p className="book-meta">
                    Condition: {book.condition ?? "—"} · Est.{" "}
                    {book.estimated_value ?? "N/A"}
                    {book.estimated_midpoint != null &&
                      ` ($${book.estimated_midpoint})`}
                  </p>
                  {book.condition_note && (
                    <p className="book-meta">Note: {book.condition_note}</p>
                  )}
                  {book.rationale && (
                    <p className="book-rationale">{book.rationale}</p>
                  )}
                  <div className="book-actions">
                    <button
                      className="btn btn-sell"
                      onClick={() => handleGenerateListing(book)}
                      disabled={loading}
                    >
                      Generate Listing
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setNoteBookId(book.id);
                        setNoteText(book.condition_note ?? "");
                      }}
                    >
                      Add Note
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => handleDelete(book.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </main>

      <nav className="tab-bar">
        {(["capture", "queue", "catalog"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`tab-btn ${tab === t ? "active" : ""}`}
            onClick={() => {
              setTab(t);
              clearMessages();
              if (t === "queue") refreshQueue();
              if (t === "catalog") loadBooks();
            }}
          >
            {t === "capture" && `Capture${queue.length ? ` (${queue.length})` : ""}`}
            {t === "queue" && `Queue (${queue.length})`}
            {t === "catalog" && `Catalog (${books.length})`}
          </button>
        ))}
      </nav>

      {modalContent && (
        <div className="modal-overlay" onClick={() => setModalContent(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{modalTitle}</h3>
            <pre>{modalContent}</pre>
            <button
              className="btn btn-primary modal-close"
              onClick={() => setModalContent(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {scanning && (
        <div className="modal-overlay" onClick={() => setScanning(false)}>
          <div className="modal scanner-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Scan ISBN Barcode</h3>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: 12 }}>
              Point your camera at the barcode on the back cover
            </p>
            <video ref={videoRef} className="scanner-video" playsInline muted />
            <button
              className="btn btn-secondary modal-close"
              onClick={() => setScanning(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {noteBookId && (
        <div className="modal-overlay" onClick={() => setNoteBookId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add Note</h3>
            <div className="field">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Condition notes, listing details, etc."
              />
            </div>
            <button
              className="btn btn-primary modal-close"
              onClick={handleSaveNote}
              disabled={loading}
            >
              {loading ? "Saving..." : "Save Note"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
