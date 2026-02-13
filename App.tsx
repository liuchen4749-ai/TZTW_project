import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import { db } from './services/mockDb';
import { Project, User, ProjectTypeDef } from './types';
import { createCustomIcon } from './utils/mapUtils';

// Components - 确保这些组件已经按照之前的建议拆分并上传到对应文件夹
import ImageViewer from './components/common/ImageViewer';
import MapSearch from './components/common/MapSearch';
import ExportDropdown from './components/common/ExportDropdown';
import LoginModal from './components/modals/LoginModal';
import AddCityModal from './components/modals/AddCityModal';
import AddProjectModal from './components/modals/AddProjectModal';
import AdminPanel from './components/modals/AdminPanel';
import GuideModal from './components/modals/GuideModal';
import ExportFilterModal from './components/modals/ExportFilterModal';
import ExportHTMLModal from './components/modals/ExportHTMLModal';
import ProjectDetailModal from './components/modals/ProjectDetailModal';

// --- Main App Component ---

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [projectTypes, setProjectTypes] = useState<ProjectTypeDef[]>([]);
  const [labelFieldName] = useState('项目类别'); 

  const [showLogin, setShowLogin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showExportFilter, setShowExportFilter] = useState(false);
  const [showExportHTML, setShowExportHTML] = useState(false);

  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(33.33);
  
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [collapsedCities, setCollapsedCities] = useState<Set<string>>(new Set());

  // Filters
  const [filterCity, setFilterCity] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterLabel, setFilterLabel] = useState('all');
  const [filterCreator, setFilterCreator] = useState('all');

  const uniqueCities = useMemo(() => Array.from(new Set(projects.map(p => p.city))), [projects]);
  const uniqueLabels = useMemo(() => Array.from(new Set(projects.map(p => p.label || '无标签'))), [projects]);
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [showAddCityModal, setShowAddCityModal] = useState(false);
  const [addProjectCity, setAddProjectCity] = useState<string | null>(null);

  const [draggedProject, setDraggedProject] = useState<Project | null>(null);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});

  useEffect(() => {
    const user = db.getCurrentUser();
    setCurrentUser(user);
    loadProjects();
    loadTypes();
    setUsers(db.getUsers());
  }, []);

  const loadProjects = async () => {
    const data = await db.getProjects();
    setProjects(data);
    setSelectedIds(new Set(data.map(p => p.id)));
  };

  const loadTypes = async () => {
      const types = await db.getProjectTypes();
      setProjectTypes(types);
  };

  // 全局方法注册，确保 Leaflet 弹窗可以调用
  useEffect(() => {
      // @ts-ignore
      window.updateProjectFromPopup = async (id: string, field: string, value: string) => {
          const project = projects.find(p => p.id === id);
          if (project) {
              const updated = { ...project, [field]: value };
              setProjects(prev => prev.map(p => p.id === id ? updated : p));
              await db.saveProject(updated);
          }
      };

      // @ts-ignore
      window.handlePopupChange = (element: HTMLSelectElement, id: string, field: string, oldValue: string) => {
          if (element.value === '__NEW__') {
              const promptText = field === 'city' ? "请输入新城市名称:" : "请输入新项目类别:";
              const newValue = prompt(promptText);
              if (newValue && newValue.trim()) {
                  // @ts-ignore
                  window.updateProjectFromPopup(id, field, newValue.trim());
              } else {
                  element.value = oldValue;
              }
          } else {
              // @ts-ignore
              window.updateProjectFromPopup(id, field, element.value);
          }
      };

      // @ts-ignore
      window.handlePopupTypeChange = async (element: HTMLSelectElement, id: string, oldValue: string) => {
          if (element.value === '__NEW_TYPE__') {
              const newLabel = prompt("请输入新项目类型名称:");
              if (newLabel && newLabel.trim()) {
                  const key = 'Type_' + Date.now();
                  const newType: ProjectTypeDef = {
                      key,
                      label: newLabel.trim(),
                      color: '#3498db',
                      bgColorClass: 'bg-gray-100 text-gray-800 border-gray-200'
                  };
                  await db.addProjectType(newType);
                  loadTypes();
                  // @ts-ignore
                  window.updateProjectFromPopup(id, 'type', key);
              } else {
                  element.value = oldValue;
              }
          } else {
              // @ts-ignore
              window.updateProjectFromPopup(id, 'type', element.value);
          }
      };

      // @ts-ignore
      window.openProjectDetail = (id: string) => {
          const p = projects.find(proj => proj.id === id);
          if(p) setActiveProject(p);
      };

      // @ts-ignore
      window.toggleProjectVisibility = async (id: string) => {
          const project = projects.find(p => p.id === id);
          if (project) {
              const updated = { ...project, isHidden: !project.isHidden };
              setProjects(prev => prev.map(p => p.id === id ? updated : p));
              await db.saveProject(updated);
          }
      };
  }, [projects]);

  const filteredProjects = useMemo(() => {
      let result = projects;
      if (sidebarSearch.trim()) {
          const term = sidebarSearch.toLowerCase();
          result = result.filter(p => {
              const typeDef = projectTypes.find(t => t.key === p.type);
              const typeName = typeDef ? typeDef.label : p.type;
              return (p.name.toLowerCase().includes(term) || p.label.toLowerCase().includes(term) || typeName.toLowerCase().includes(term));
          });
      }
      result = result.filter(p => {
          const matchCity = filterCity === 'all' || p.city === filterCity;
          const matchType = filterType === 'all' || p.type === filterType;
          const matchLabel = filterLabel === 'all' || (p.label || '无标签') === filterLabel;
          const matchCreator = filterCreator === 'all' || p.createdBy === filterCreator;
          return matchCity && matchType && matchLabel && matchCreator;
      });
      return result;
  }, [projects, sidebarSearch, filterCity, filterType, filterLabel, filterCreator, projectTypes]);

  const groupedProjects = useMemo(() => {
    const groups: { [city: string]: Project[] } = {};
    filteredProjects.forEach(p => {
      if (!groups[p.city]) groups[p.city] = [];
      groups[p.city].push(p);
    });
    return groups;
  }, [filteredProjects]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current).setView([30.655, 104.08], 6);
    L.tileLayer('https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
        attribution: 'Map data &copy; Gaode', minZoom: 3, maxZoom: 18
    }).addTo(map);
    mapRef.current = map;
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    Object.values(markersRef.current).forEach(m => map.removeLayer(m));
    markersRef.current = {};

    projects.forEach((p) => {
      if (!selectedIds.has(p.id)) return;
      if (p.isHidden && !currentUser) return;
      if (!filteredProjects.find(fp => fp.id === p.id)) return;

      const typeDef = projectTypes.find(t => t.key === p.type);
      const color = typeDef ? typeDef.color : '#3498db';
      const isActive = p.id === activeMarkerId;
      const editable = canEdit(p);

      const marker = L.marker([p.lat, p.lng], {
        icon: createCustomIcon(color, isActive),
        draggable: editable,
        zIndexOffset: isActive ? 1000 : 0,
        opacity: (p.isHidden && currentUser) ? 0.5 : 1
      }).addTo(map);

      marker.bindTooltip(`${p.name}${p.isHidden ? ' (隐)' : ''}`, { permanent: true, direction: 'right', className: 'bg-black bg-opacity-80 text-white border-none text-sm font-bold px-2 py-1 rounded shadow-md', offset: [12, 0] });

      marker.on('click', () => {
          setActiveMarkerId(p.id); 
          const el = document.getElementById(`project-row-${p.id}`);
          if(el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      marker.on('dragend', async (e) => {
          const newPos = e.target.getLatLng();
          const updated = { ...p, lat: newPos.lat, lng: newPos.lng };
          setProjects(prev => prev.map(proj => proj.id === p.id ? updated : proj));
          await db.saveProject(updated);
      });

      markersRef.current[p.id] = marker;
    });
  }, [projects, selectedIds, activeMarkerId, currentUser, filteredProjects, projectTypes]); 

  const canEdit = (project: Project) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    if (currentUser.role === 'editor') return project.createdBy === currentUser.id;
    return false;
  };

  const hasWriteAccess = currentUser && (currentUser.role === 'admin' || currentUser.role === 'editor');
  const isAdmin = currentUser && currentUser.role === 'admin';

  const handleLogout = async () => { await db.logout(); setCurrentUser(null); setActiveMarkerId(null); };

  const confirmAddCity = async (city: string) => {
      const center = mapRef.current?.getCenter() || { lat: 30.655, lng: 104.08 };
      const newProject: Project = { id: Date.now().toString(), name: '新建项目', city, type: 'Commercial', label: '待定', lat: center.lat, lng: center.lng, isHidden: false, publicDescription: '', images: [], createdBy: currentUser!.id, createdByName: currentUser!.name };
      await db.saveProject(newProject);
      loadProjects();
      setShowAddCityModal(false);
  };

  const confirmAddProject = async (city: string, name: string, type: string, label: string) => {
      const center = mapRef.current?.getCenter() || { lat: 30.655, lng: 104.08 };
      const newProject: Project = { id: Date.now().toString(), name, city, type, label, lat: center.lat, lng: center.lng, isHidden: false, publicDescription: '', images: [], createdBy: currentUser!.id, createdByName: currentUser!.name };
      await db.saveProject(newProject);
      loadProjects();
      setShowAddProjectModal(false);
  };

  const handleRenameProject = async (p: Project) => {
      if(!canEdit(p)) return;
      const newName = prompt("重命名项目:", p.name);
      if(newName && newName !== p.name) {
          const updated = { ...p, name: newName };
          await db.saveProject(updated);
          loadProjects();
      }
  };

  const handleDeleteProject = async (p: Project) => {
    if (!canEdit(p)) return;
    if (!confirm(`确定删除 ${p.name}?`)) return;
    await db.deleteProject(p.id);
    loadProjects();
  };
  
  const handleDeleteCity = async (city: string) => {
      if(!isAdmin) return;
      if(confirm(`确定删除城市 [${city}]?`)) {
          // @ts-ignore
          if(db.deleteProjectsByCity) await db.deleteProjectsByCity(city);
          loadProjects();
      }
  };

  const toggleCityCollapse = (city: string) => {
      const newSet = new Set(collapsedCities);
      if(newSet.has(city)) newSet.delete(city);
      else newSet.add(city);
      setCollapsedCities(newSet);
  };

  const focusProject = (p: Project) => { 
      mapRef.current?.setView([p.lat, p.lng], 16); 
      markersRef.current[p.id]?.openPopup(); 
      setActiveMarkerId(p.id);
  };
  
  const toggleSelection = (id: string) => {
      const newSet = new Set(selectedIds);
      if(newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedIds(newSet);
  };

  const toggleCitySelection = (cityProjects: Project[]) => {
      const allSelected = cityProjects.every(p => selectedIds.has(p.id));
      const newSet = new Set(selectedIds);
      cityProjects.forEach(p => {
          if(allSelected) newSet.delete(p.id);
          else newSet.add(p.id);
      });
      setSelectedIds(newSet);
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen overflow-hidden font-sans text-[#333]">
      {/* Sidebar */}
      <div className="order-2 md:order-1 bg-white shadow-lg flex flex-col z-[1000] border-r border-gray-200 h-[60vh] md:h-full w-full md:w-auto" style={{ width: `${sidebarWidth}%`, minWidth: '250px' }}>
        <div className="bg-[#2c3e50] text-white p-4 shrink-0">
          <div className="flex justify-between items-center mb-2">
             <h2 className="text-lg font-bold">TZTW 项目管理系统</h2>
             {currentUser ? (
                <div className="flex gap-2 text-xs">
                    <span className="bg-blue-600 px-2 py-1 rounded">👤 {currentUser.name}</span>
                    <button onClick={handleLogout} className="bg-red-500 px-2 py-1 rounded hover:bg-red-600">退出</button>
                </div>
             ) : <button onClick={() => setShowLogin(true)} className="bg-green-600 text-xs px-3 py-1 rounded font-bold hover:bg-green-700">登录</button>}
          </div>
          <div className="flex gap-2 mb-3">
             <button onClick={() => setShowGuide(true)} className="flex-1 bg-[#f39c12] text-white py-1 px-2 rounded text-xs font-bold">🗺️ 旅行条件</button>
             {hasWriteAccess && <ExportDropdown onExportPDF={() => setShowExportFilter(true)} onExportHTML={() => setShowExportHTML(true)} />}
          </div>
          <input type="text" className="w-full p-2 rounded text-black text-sm" placeholder="🔍 搜索项目..." value={sidebarSearch} onChange={e => setSidebarSearch(e.target.value)} />
        </div>

        <div className="flex-1 overflow-y-auto bg-[#f8f9fa]">
          {Object.entries(groupedProjects).map(([city, list]) => {
            const allSelected = list.every(p => selectedIds.has(p.id));
            return (
                <div key={city} className="bg-white mb-2 border-b">
                <div className="p-3 font-bold bg-white border-b flex justify-between items-center cursor-pointer" onClick={() => toggleCityCollapse(city)}>
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={!!allSelected} onChange={() => toggleCitySelection(list)} className="w-4 h-4" />
                        <span>{collapsedCities.has(city) ? '▶' : '▼'} 🏙️ {city}</span>
                    </div>
                    {isAdmin && <button onClick={e => { e.stopPropagation(); handleDeleteCity(city); }} className="text-red-500"><i className="fa-solid fa-trash"></i></button>}
                </div>
                {!collapsedCities.has(city) && list.map(proj => (
                    <div key={proj.id} id={`project-row-${proj.id}`} className={`flex items-center p-2 border-b hover:bg-gray-100 cursor-pointer ${activeMarkerId === proj.id ? 'bg-blue-50 border-r-4 border-blue-500' : ''}`} onClick={() => focusProject(proj)}>
                        <input type="checkbox" checked={!!selectedIds.has(proj.id)} onChange={e => { e.stopPropagation(); toggleSelection(proj.id); }} className="mr-2" />
                        <span className="flex-1 text-sm truncate">{proj.name}</span>
                    </div>
                ))}
                </div>
            );
          })}
        </div>
        {currentUser && <button onClick={() => setShowAddCityModal(true)} className="p-4 bg-[#8e44ad] text-white font-bold">新增城市</button>}
      </div>

      {/* Map */}
      <div className="flex-1 relative bg-gray-100 z-0 h-[40vh] md:h-full" ref={mapContainerRef}>
          <MapSearch map={mapRef.current} />
      </div>

      {/* Modals */}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onLogin={setCurrentUser} />}
      {showAddCityModal && <AddCityModal onClose={() => setShowAddCityModal(false)} onConfirm={confirmAddCity} />}
      {showAddProjectModal && <AddProjectModal initialCity={addProjectCity} projectTypes={projectTypes} onClose={() => setShowAddProjectModal(false)} onConfirm={confirmAddProject} />}
      {activeProject && <ProjectDetailModal project={activeProject} currentUser={currentUser} projectTypes={projectTypes} onClose={() => setActiveProject(null)} onSave={updated => setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))} />}
      {showGuide && <GuideModal projects={projects.filter(p => selectedIds.has(p.id))} projectTypes={projectTypes} onClose={() => setShowGuide(false)} />}
      {showExportFilter && <ExportFilterModal projects={projects.filter(p => selectedIds.has(p.id))} projectTypes={projectTypes} onClose={() => setShowExportFilter(false)} />}
      {showExportHTML && <ExportHTMLModal projects={projects.filter(p => selectedIds.has(p.id))} projectTypes={projectTypes} onClose={() => setShowExportHTML(false)} />}
    </div>
  );
}
