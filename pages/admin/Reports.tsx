
import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Search,
  ChevronRight,
  Sparkles,
  LifeBuoy,
  PieChart,
  Download,
  Calendar,
  CreditCard,
  Users,
  FileText,
  Loader2,
  X
} from 'lucide-react';
import { Report, ReportCategory } from '../../types';

import { authedFetch } from '../../lib/authedFetch';
const ReportsDashboard: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningReport, setRunningReport] = useState<string | null>(null);
  const [reportResults, setReportResults] = useState<{ columns: any[], results: any[], report: Report } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const res = await authedFetch('/api/tools?resource=reports');
      const data = await res.json();
      if (data.ok) setReports(data.reports);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const runReport = async (report: Report) => {
    setRunningReport(report.id);
    try {
      const res = await authedFetch(`/api/tools?resource=reports&action=run&reportId=${report.id}`);
      const data = await res.json();
      if (data.ok) {
        setReportResults({
          columns: data.columns || [],
          results: data.results || [],
          report: report
        });
      }
    } catch (err) {
      console.error(err);
      alert("Failed to run report.");
    } finally {
      setRunningReport(null);
    }
  };

  const downloadCSV = () => {
    if (!reportResults) return;
    const { columns, results, report } = reportResults;
    if (results.length === 0) return alert("No data to export.");

    const headers = columns.map(c => c.label).join(',');
    const rows = results.map(row =>
      columns.map(c => `"${(row[c.key] || '').toString().replace(/"/g, '""')}"`).join(',')
    );
    const csvContent = [headers, ...rows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${report.name}_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'Finance': return <CreditCard size={24} />;
      case 'People': return <Users size={24} />;
      case 'Attendance': return <Calendar size={24} />;
      default: return <FileText size={24} />;
    }
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'Finance': return 'bg-burgundy text-white';
      case 'People': return 'bg-gold text-burgundy';
      case 'Attendance': return 'bg-[#1a2e35] text-white';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const filteredReports = reports.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedReports = filteredReports.reduce((acc, report) => {
    if (!acc[report.category]) acc[report.category] = [];
    acc[report.category].push(report);
    return acc;
  }, {} as Record<string, Report[]>);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold text-[#0d1a14] mb-2 tracking-tight">Reports & Insights</h1>
          <p className="text-gray-400 font-medium">Real-time analytics for Finance, Membership, and Attendance.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search reports..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 pr-4 py-3 rounded-2xl border border-gray-200 focus:border-gold outline-none w-full md:w-64"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-300" size={32} /></div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedReports).map(([category, catReports]) => (
            <div key={category}>
              <h3 className="text-xl font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                {getCategoryIcon(category)} {category}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {catReports.map(report => (
                  <button
                    key={report.id}
                    onClick={() => runReport(report)}
                    disabled={!!runningReport}
                    className="bg-white p-6 rounded-[2rem] border border-gray-50 shadow-sm hover:shadow-xl transition-all text-left group flex flex-col h-full border-l-4 border-l-transparent hover:border-l-gold disabled:opacity-50"
                  >
                    <div className="flex justify-between items-start mb-4 w-full">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${getCategoryColor(report.category)}`}>
                        {runningReport === report.id ? <Loader2 className="animate-spin" size={24} /> : <BarChart size={24} />}
                      </div>
                      <span className="p-2 rounded-full bg-gray-50 text-gray-300 group-hover:text-burgundy transition-colors"><ChevronRight size={20} /></span>
                    </div>
                    <h4 className="text-lg font-bold text-[#0d1a14] mb-2">{report.name}</h4>
                    <p className="text-sm text-gray-400 font-medium flex-1">{report.description}</p>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {reports.length === 0 && (
            <div className="text-center py-20 bg-gray-50 rounded-[3rem] border border-dashed border-gray-200">
              <p className="text-gray-400 font-medium">No reports found. Need to seed the database?</p>
            </div>
          )}
        </div>
      )}

      {/* Results Modal */}
      {reportResults && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black text-[#0d1a14]">{reportResults.report.name}</h2>
                <p className="text-gray-400 font-medium text-sm">{reportResults.results.length} records found</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={downloadCSV} className="px-4 py-2 bg-gold-cream text-gold font-bold rounded-xl hover:bg-gold hover:text-white transition-colors flex items-center gap-2">
                  <Download size={18} /> Export
                </button>
                <button onClick={() => setReportResults(null)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="overflow-auto p-8 custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-100">
                    {reportResults.columns.map((col, idx) => (
                      <th key={idx} className="pb-4 text-xs font-black text-gray-400 uppercase tracking-widest">{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportResults.results.map((row, rIdx) => (
                    <tr key={rIdx} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      {reportResults.columns.map((col, cIdx) => (
                        <td key={cIdx} className="py-4 pr-4">
                          {col.key === 'name' && row.avatar_url && (
                            <div className="flex items-center gap-3">
                              <img src={row.avatar_url} className="w-8 h-8 rounded-full object-cover bg-gray-100" />
                              <div>
                                <p className="font-bold text-[#0d1a14]">{row.name}</p>
                                {row.subtext && <p className="text-xs text-gray-400">{row.subtext}</p>}
                              </div>
                            </div>
                          )}
                          {col.key === 'name' && !row.avatar_url && (
                            <div>
                              <p className="font-bold text-[#0d1a14]">{row.name}</p>
                              {row.subtext && <p className="text-xs text-gray-400">{row.subtext}</p>}
                            </div>
                          )}

                          {col.key !== 'name' && (
                            <span className="text-sm font-medium text-gray-600">{row[col.key]}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsDashboard;
