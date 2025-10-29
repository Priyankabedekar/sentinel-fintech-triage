/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { Upload, CheckCircle, AlertCircle, FileText } from "lucide-react";
import { api } from '../lib/api.ts'
import "../styles/Ingest.css";

export default function Ingest() {
  const [file, setFile] = useState<File | null>(null);
  const [jsonInput, setJsonInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"json" | "csv">("json");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError("");
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      let transactions;

      if (mode === "json") {
        const parsed = JSON.parse(jsonInput);
        transactions = Array.isArray(parsed) ? parsed : parsed.transactions;
      } else if (file) {
        const text = await file.text();
        const lines = text.split("\n").filter((l) => l.trim());
        const headers = lines[0].split(",");

        transactions = lines.slice(1).map((line) => {
          const values = line.split(",");
          const obj: any = {};
          headers.forEach((h, i) => {
            obj[h.trim()] = values[i]?.trim();
          });
          return obj;
        });
      }

      const response = await api.post(
        "http://localhost:3000/api/ingest/transactions",
        { transactions },
        {
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": `ingest_${Date.now()}`,
          },
        }
      );

      setResult(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const sampleJson = `{
[
    {
      "customer_id": "valid_uuid-here",
      "card_id": "valid_uuid-here",
      "merchant": "Amazon India",
      "amount_cents": 15000,
      "mcc": "5999",
      "currency": "INR"
    },
    {
      "customer_id": "valid_uuid-here",
      "card_id": "valid_uuid-here",
      "merchant": "Amazon India",
      "amount_cents": 15000,
      "mcc": "5999",
      "currency": "INR"
    },
]`;

  return (
    <div className="ingest-page">
      <header className="ingest-header">
        <h1 className="ingest-title">Transaction Ingestion</h1>
        <p className="ingest-subtitle">Upload transactions via JSON or CSV</p>
      </header>

      {/* Mode Selector */}
      <div className="card">
        <div className="card-body">
          <div className="mode-selector">
            <button
              onClick={() => setMode("json")}
              className={`mode-btn ${mode === "json" ? "active" : ""}`}
            >
              <FileText size={20} />
              JSON Input
            </button>
            <button
              onClick={() => setMode("csv")}
              className={`mode-btn ${mode === "csv" ? "active" : ""}`}
            >
              <Upload size={20} />
              CSV Upload
            </button>
          </div>
        </div>
      </div>

      {/* JSON Mode */}
      {mode === "json" && (
        <div className="card">
          <div className="card-header">
            <h2 className="chart-title">JSON Input</h2>
          </div>
          <div className="card-body">
            <textarea
              className="json-input"
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder={sampleJson}
              rows={15}
            />
            <button
              onClick={handleSubmit}
              disabled={loading || !jsonInput}
              className="btn btn-primary"
              style={{ marginTop: "1rem" }}
            >
              {loading ? "Uploading..." : "Ingest Transactions"}
            </button>
          </div>
        </div>
      )}

      {/* CSV Mode */}
      {mode === "csv" && (
        <div className="card">
          <div className="card-header">
            <h2 className="chart-title">CSV Upload</h2>
          </div>
          <div className="card-body">
            <div className="file-upload">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="file-input"
                id="csv-file"
              />
              <label htmlFor="csv-file" className="file-label">
                <Upload size={24} />
                {file ? file.name : "Choose CSV file"}
              </label>
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading || !file}
              className="btn btn-primary"
              style={{ marginTop: "1rem" }}
            >
              {loading ? "Uploading..." : "Ingest Transactions"}
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="card">
          <div className="card-header">
            <h2 className="chart-title">
              <CheckCircle size={20} className="text-success" />
              Upload Successful
            </h2>
          </div>
          <div className="card-body">
            <div className="result-stats">
              <div className="stat-item">
                <span className="stat-label">Accepted</span>
                <span className="stat-value">{result.count}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Failed</span>
                <span className="stat-value">{result.failed || 0}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Request ID</span>
                <span className="stat-value-small">{result.requestId}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="alert alert-danger">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Sample CSV */}
      <div className="card">
        <div className="card-header">
          <h2 className="chart-title">Sample CSV Format</h2>
        </div>
        <div className="card-body">
          <pre className="sample-csv">
            customer_id,card_id,merchant,amount_cents,mcc,currency
            uuid1,uuid2,Amazon India,15000,5999,INR
            uuid1,uuid2,Swiggy,45000,5812,INR
          </pre>
        </div>
      </div>
    </div>
  );
}
