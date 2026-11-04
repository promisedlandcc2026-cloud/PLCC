
import React, { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  ChevronRight, 
  Search, 
  Plus, 
  Filter, 
  MoreVertical,
  ArrowUpRight,
  TrendingUp,
  Users,
  DollarSign,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

interface MockItem {
  id: number;
  entity: string;
  ref: string;
  status: 'Completed' | 'Pending' | 'Failed';
  date: Date;
  amount: number;
}

type SortField = 'entity' | 'status' | 'date';
type SortOrder = 'asc' | 'desc';

interface GenericPageProps {
  title: string;
}

const StatCard: React.FC<{ 
  label: string; 
  value: string; 
  change: string; 
  trend: 'up' | 'down'; 
  icon: React.ReactNode; 
  bgColor: string 
}> = ({ label, value, change, trend, icon, bgColor }) => (
  <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow group">
    <div className="flex items-center justify-between mb-4">
      <div className={`p-3 rounded-lg ${bgColor} shadow-sm group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <div className={`flex items-center text-sm font-bold ${trend === 'up' ? 'text-gold' : 'text-red-600'}`}>
        {change}
        {trend === 'up' ? <ArrowUpRight size={14} className="ml-1" /> : <TrendingUp size={14} className="ml-1 rotate-180" />}
      </div>
    </div>
    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">{label}</p>
    <p className="text-2xl font-bold text-burgundy mt-1">{value}</p>
  </div>
);

const GenericPage: React.FC<GenericPageProps> = ({ title }) => {
  const location = useLocation();
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [searchQuery, setSearchQuery] = useState('');

  const initialData: MockItem[] = useMemo(() => [
    { id: 1, entity: 'Alpha Ministry', ref: 'CD-12341', status: 'Completed', date: new Date(2023, 9, 24, 10, 30), amount: 250.00 },
    { id: 2, entity: 'Zion Fellowship', ref: 'CD-12342', status: 'Pending', date: new Date(2023, 9, 22, 14, 15), amount: 125.50 },
    { id: 3, entity: 'Grace Community', ref: 'CD-12343', status: 'Completed', date: new Date(2023, 9, 25, 0, 0), amount: 500.00 },
    { id: 4, entity: 'Hope Center', ref: 'CD-12344', status: 'Failed', date: new Date(2023, 9, 20, 9, 45), amount: 75.00 },
    { id: 5, entity: 'Bethany Chapel', ref: 'CD-12345', status: 'Completed', date: new Date(2023, 9, 23, 11, 20), amount: 1000.00 },
  ], []);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const sortedData = useMemo(() => {
    let data = [...initialData];
    if (searchQuery) {
      data = data.filter(item => 
        item.entity.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.ref.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    if (!sortField) return data;
    return data.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'entity') comparison = a.entity.localeCompare(b.entity);
      else if (sortField === 'status') comparison = a.status.localeCompare(b.status);
      else if (sortField === 'date') comparison = a.date.getTime() - b.date.getTime();
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [initialData, sortField, sortOrder, searchQuery]);

  const formatDate = (date: Date) => {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={14} className="ml-1 opacity-40" />;
    return sortOrder === 'asc' ? <ArrowUp size={14} className="ml-1 text-gold" /> : <ArrowDown size={14} className="ml-1 text-gold" />;
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        <div>
          <nav className="flex items-center text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
            <span>Home</span>
            <ChevronRight size={10} className="mx-1 text-gold" />
            <span className="text-gold">{location.pathname.split('/')[1] || 'Dashboard'}</span>
          </nav>
          <h1 className="text-2xl font-bold text-[#0d1a14] sm:text-3xl">{title}</h1>
        </div>
        <div className="flex items-center space-x-3">
          <button className="inline-flex items-center px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors">
            <Filter size={16} className="mr-2 text-gold" />
            Filter
          </button>
          <button className="inline-flex items-center px-4 py-2 bg-burgundy border border-gold/30 rounded-lg text-sm font-bold text-gold hover:bg-burgundy-dark shadow-md transition-colors active:scale-95">
            <Plus size={16} className="mr-2" />
            Create New
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          label="Total Giving" 
          value="$128,430" 
          change="+12.5%" 
          trend="up" 
          icon={<DollarSign size={20} className="text-gold" />} 
          bgColor="bg-burgundy"
        />
        <StatCard 
          label="Parishioners" 
          value="2,842" 
          change="+3.2%" 
          trend="up" 
          icon={<Users size={20} className="text-gold" />} 
          bgColor="bg-burgundy"
        />
        <StatCard 
          label="Attendance" 
          value="85%" 
          change="-2.4%" 
          trend="down" 
          icon={<TrendingUp size={20} className="text-burgundy" />} 
          bgColor="bg-gold-cream"
        />
        <StatCard 
          label="New Members" 
          value="148" 
          change="+18%" 
          trend="up" 
          icon={<ArrowUpRight size={20} className="text-gold" />} 
          bgColor="bg-burgundy"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-6 border-b border-gray-50 flex items-center justify-between bg-gold-cream/5">
          <h2 className="text-lg font-bold text-burgundy uppercase tracking-tight">Recent Activity</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Search activity..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-gray-50/50 border border-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/10 w-full md:w-64"
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-y border-gray-50">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer hover:bg-gold-cream/30 transition-colors" onClick={() => handleSort('entity')}>
                  <div className="flex items-center">Entity <SortIcon field="entity" /></div>
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer hover:bg-gold-cream/30 transition-colors" onClick={() => handleSort('status')}>
                  <div className="flex items-center">Status <SortIcon field="status" /></div>
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer hover:bg-gold-cream/30 transition-colors" onClick={() => handleSort('date')}>
                  <div className="flex items-center">Date <SortIcon field="date" /></div>
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Amount</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sortedData.map((item) => (
                <tr key={item.id} className="hover:bg-gold-cream/10 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-xl bg-burgundy/5 text-burgundy flex items-center justify-center font-bold text-xs mr-4 border border-burgundy/5 shadow-sm">
                        {item.entity.charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-900 leading-tight">{item.entity}</div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase mt-0.5">{item.ref}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      item.status === 'Completed' ? 'bg-gold-cream text-gold border-gold/20' :
                      item.status === 'Pending' ? 'bg-gray-50 text-gray-500 border-gray-100' :
                      'bg-red-50 text-red-600 border-red-100'
                    }`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-sm text-gray-400 font-medium">{formatDate(item.date)}</td>
                  <td className="px-6 py-5 text-sm font-bold text-burgundy">${item.amount.toFixed(2)}</td>
                  <td className="px-6 py-5 text-right">
                    <button className="text-gray-300 hover:text-gold transition-colors p-2">
                      <MoreVertical size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default GenericPage;
