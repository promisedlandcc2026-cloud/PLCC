
import React, { useState, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, Loader, Calendar } from 'lucide-react';

import { authedFetch } from '../../lib/authedFetch';
const FormExportsPage: React.FC = () => {
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    fetchForms();
  }, []);

  const fetchForms = async () => {
    try {
      const response = await authedFetch('/api/tools?resource=forms');
      const data = await response.json();
      if (data.ok) {
        setForms(data.forms || []);
      }
    } catch (err) {
      console.error('Failed to load forms', err);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = async (formId: string, formTitle: string) => {
    try {
      setExporting(formId);

      // Fetch submissions for this form
      const response = await authedFetch(`/api/tools?resource=submissions&formId=${formId}`);
      const data = await response.json();

      if (!data.ok || !data.submissions || data.submissions.length === 0) {
        alert('No submissions to export for this form');
        return;
      }

      const submissions = data.submissions;

      // Get all unique field names from submissions
      const allFields = new Set<string>();
      submissions.forEach((sub: any) => {
        Object.keys(sub.submission_data || {}).forEach(key => allFields.add(key));
      });

      // Create CSV header
      const headers = ['Submission ID', 'Submitted By', 'Email', 'Status', 'Submitted At', ...Array.from(allFields)];
      const csvRows = [headers.join(',')];

      // Add data rows
      submissions.forEach((sub: any) => {
        const row = [
          sub.id,
          sub.submitted_by_member ? `${sub.submitted_by_member.first_name} ${sub.submitted_by_member.last_name}` : 'Anonymous',
          sub.submitted_by_member?.email || 'N/A',
          sub.status,
          new Date(sub.created_at).toLocaleString(),
          ...Array.from(allFields).map(field => {
            const value = sub.submission_data[field];
            // Escape commas and quotes in CSV
            if (value === null || value === undefined) return '';
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('"')) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          })
        ];
        csvRows.push(row.join(','));
      });

      // Create and download file
      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.setAttribute('href', url);
      link.setAttribute('download', `${formTitle.replace(/\s+/g, '_')}_submissions_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (err) {
      console.error('Export failed', err);
      alert('Failed to export data');
    } finally {
      setExporting(null);
    }
  };

  const exportToJSON = async (formId: string, formTitle: string) => {
    try {
      setExporting(formId);

      const response = await authedFetch(`/api/tools?resource=submissions&formId=${formId}`);
      const data = await response.json();

      if (!data.ok || !data.submissions || data.submissions.length === 0) {
        alert('No submissions to export for this form');
        return;
      }

      const jsonContent = JSON.stringify(data.submissions, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.setAttribute('href', url);
      link.setAttribute('download', `${formTitle.replace(/\s+/g, '_')}_submissions_${new Date().toISOString().split('T')[0]}.json`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (err) {
      console.error('Export failed', err);
      alert('Failed to export data');
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader className="w-8 h-8 text-burgundy animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold text-[#0d1a14] mb-2 tracking-tight">Data Exports</h1>
          <p className="text-gray-400 font-medium">Export form submissions and analytics data for external analysis.</p>
        </div>
      </div>

      {forms.length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-8 text-center">
          <FileSpreadsheet className="w-16 h-16 text-blue-500 mx-auto mb-4" />
          <h3 className="text-lg font-black text-blue-900 mb-2">No Forms Available</h3>
          <p className="text-sm text-blue-700">
            Create forms first to start collecting and exporting data.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {forms.map(form => (
            <div key={form.id} className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-gold-cream flex items-center justify-center">
                  <FileSpreadsheet size={24} className="text-gold" />
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${form.status === 'Active' ? 'bg-green-100 text-green-700' :
                    form.status === 'Draft' ? 'bg-gray-100 text-gray-600' :
                      'bg-red-100 text-red-600'
                  }`}>
                  {form.status}
                </span>
              </div>

              <h3 className="text-lg font-black text-[#0d1a14] mb-2">{form.title}</h3>
              <p className="text-sm text-gray-500 mb-4 line-clamp-2">{form.description || 'No description'}</p>

              <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
                <Calendar size={14} />
                <span>{form.submissions || 0} submissions</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => exportToCSV(form.id, form.title)}
                  disabled={exporting === form.id || form.submissions === 0}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-burgundy text-gold rounded-xl hover:bg-burgundy-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold"
                >
                  {exporting === form.id ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet size={16} />
                  )}
                  CSV
                </button>
                <button
                  onClick={() => exportToJSON(form.id, form.title)}
                  disabled={exporting === form.id || form.submissions === 0}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold"
                >
                  {exporting === form.id ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText size={16} />
                  )}
                  JSON
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
          <h4 className="font-black text-blue-900 mb-2">CSV Format</h4>
          <p className="text-sm text-blue-700">
            Compatible with Excel, Google Sheets, and most data analysis tools. Perfect for creating charts and reports.
          </p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-6">
          <h4 className="font-black text-purple-900 mb-2">JSON Format</h4>
          <p className="text-sm text-purple-700">
            Structured data format ideal for developers, custom integrations, and programmatic data processing.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FormExportsPage;
