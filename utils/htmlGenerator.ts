import { Project, ProjectTypeDef } from '../types';

export const generateStandaloneHTML = (projects: Project[], projectTypes: ProjectTypeDef[], title: string, permission: 'admin' | 'guest') => {
    // 1. 根据权限过滤数据
    // 注意：管理员权限会明确保留内部字段
    const safeData = projects.map(p => {
        // 👈 核心修复：使用 'as any' 绕过 TypeScript 对 delete 操作的严格限制
        const copy = { ...p } as any; 
        if (permission === 'guest') {
            delete copy.internalDescription;
            delete copy.internalImages;
            delete copy.attachments;
            delete copy.createdBy;
            delete copy.createdByName;
        }
        return copy;
    });

    // 仅基于导出的数据提取过滤器的唯一值
    const cities = Array.from(new Set(safeData.map((p: any) => p.city))).sort() as string[];
    const labels = Array.from(new Set(safeData.map((p: any) => p.label))).sort() as string[];
    
    // 仅过滤导出数据中存在的项目类型
    const usedTypeKeys = new Set(safeData.map((p: any) => p.type));
    const usedProjectTypes = projectTypes.filter(t => usedTypeKeys.has(t.key));

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
    <style>
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #f1f1f1; }
        ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 4px; }
        .leaflet-popup-content-wrapper { border-radius: 6px; padding: 0; }
        .leaflet-popup-content { margin: 0; width: 240px !important; }
        .custom-icon { transition: all 0.2s; }
        .active-marker { z-index: 1000 !important; }
    </style>
</head>
<body class="bg-gray-100 h-screen w-screen flex flex-col overflow-hidden">
    <div class="bg-[#2c3e50] text-white p-4 shrink-0 flex justify-between items-center shadow z-20">
        <div class="flex items-center gap-4">
            <h1 class="text-lg font-bold">TZTW 考察系统 - ${title}</h1>
            <div class="text-xs bg-blue-600 px-2 py-1 rounded">
                ${permission === 'admin' ? '🔒 管理员视图' : '👁️ 游客视图'}
            </div>
        </div>
        <div class="flex gap-2">
            <button onclick="openGuideModal()" class="bg-[#f39c12] text-white px-3 py-1 rounded text-xs font-bold hover:bg-yellow-600">🗺️ 旅行条件</button>
            <button onclick="openExportModal()" class="bg-red-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-red-700">📄 导出 PDF</button>
        </div>
    </div>

    <div class="flex flex-1 overflow-hidden" id="mainContainer">
        <div id="sidebarPanel" style="width: 33.33%; min-width: 250px;" class="bg-white flex flex-col border-r shadow z-10">
            <div class="p-2 border-b bg-[#34495e] flex flex-col gap-2">
                <input id="searchInput" type="text" placeholder="🔍 搜索项目..." class="w-full p-2 rounded text-sm">
                <div class="flex gap-1 text-xs">
                    <select id="filterCity" class="flex-1 p-1 rounded"><option value="all">全部城市</option></select>
                    <select id="filterType" class="flex-1 p-1 rounded"><option value="all">全部类型</option></select>
                </div>
                <select id="filterLabel" class="w-full p-1 rounded text-xs"><option value="all">全部属性</option></select>
            </div>
            <div id="sidebarContent" class="flex-1 overflow-y-auto"></div>
            ${permission === 'admin' ? \`
            <div class="p-4 bg-white border-t">
                <button onclick="addNewCity()" class="w-full bg-[#8e44ad] text-white py-2 rounded font-bold text-sm hover:bg-[#732d91]"><i class="fa-solid fa-city"></i> 新增城市</button>
            </div>\` : ''}
        </div>
        <div id="resizer" class="w-[10px] bg-[#f1f1f1] border-l border-r border-gray-300 cursor-col-resize flex items-center justify-center z-[1001] hover:bg-gray-200 select-none">
            <span class="text-gray-400 text-[10px] tracking-widest pointer-events-none">||</span>
        </div>
        <div id="map" class="flex-1 z-0 relative">
             <div class="absolute top-2 right-2 z-[1000] bg-white p-1 rounded shadow-md flex">
                <input id="mapSearchInput" type="text" class="p-1 px-2 text-sm outline-none w-40" placeholder="输入地名搜索..." onkeydown="if(event.key==='Enter') searchMap()">
                <button onclick="searchMap()" class="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
                    <i class="fa-solid fa-search"></i>
                </button>
            </div>
        </div>
    </div>

    <div id="modalOverlay" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-[5000]">
        <div class="bg-white rounded-lg w-[70vw] max-w-[95%] h-[90vh] flex flex-col shadow-2xl border-4 border-[#333] relative">
            <button onclick="closeModal('modalOverlay')" class="absolute top-2 right-2 text-2xl text-gray-500 hover:text-black z-10">✕</button>
            <div id="modalContent" class="flex-1 overflow-y-auto bg-[#f0f2f5]"></div>
        </div>
    </div>

    <div id="guideModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-[5000]">
        <div class="bg-white rounded-lg w-[700px] max-w-[95%] h-[85vh] flex flex-col shadow-xl">
            <div class="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                <span class="font-bold text-lg">🗺️ 生成旅行条件 (仅选中项目)</span>
                <button onclick="closeModal('guideModal')" class="text-2xl text-gray-500 hover:text-black">✕</button>
            </div>
            <div class="p-4 bg-gray-100 grid grid-cols-2 gap-4 text-sm">
                <div><label class="block font-bold mb-1">📍 出发地</label><input id="g_city" class="w-full border p-2 rounded" placeholder="北京"></div>
                <div><label class="block font-bold mb-1">📅 出发日期</label><input type="date" id="g_start" class="w-full border p-2 rounded"></div>
                <div><label class="block font-bold mb-1">🏁 返程日期</label><input type="date" id="g_end" class="w-full border p-2 rounded"></div>
                <div><label class="block font-bold mb-1">✈️ 长途交通</label><select id="g_long" class="w-full border p-2 rounded"><option>智能混排</option><option>飞机</option></select></div>
                <div class="col-span-2"><button onclick="generateGuide()" class="bg-green-600 text-white w-full py-2 rounded font-bold">✨ 生成方案</button></div>
            </div>
            <div id="guideContent" class="flex-1 overflow-y-auto p-6 bg-gray-50"></div>
            <div class="p-4 border-t text-right"><button onclick="downloadPDF('guideContent', '考察行程方案.pdf')" class="bg-red-500 text-white px-4 py-2 rounded">⬇️ 导出 PDF</button></div>
        </div>
    </div>

    <div id="exportModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-[5000]">
        <div class="bg-white rounded-lg w-[800px] h-[90vh] flex flex-col shadow-xl">
            <div class="p-4 border-b flex justify-between items-center bg-gray-50">
                <span class="font-bold text-lg">📄 导出项目清单 (仅选中项目)</span>
                <button onclick="closeModal('exportModal')" class="text-2xl text-gray-500 hover:text-black">✕</button>
            </div>
            <div class="p-4 bg-gray-100 flex gap-4 items-center">
               <input id="pdfTitle" value="项目清单" class="border p-2 rounded flex-1">
               <button onclick="downloadPDF('exportContent', document.getElementById('pdfTitle').value+'.pdf')" class="bg-red-600 text-white px-4 py-2 rounded font-bold">⬇️ 下载</button>
            </div>
            <div class="flex-1 overflow-y-auto p-8 bg-gray-50">
                <div id="exportContent" class="bg-white p-8 shadow min-h-full"></div>
            </div>
        </div>
    </div>

    <script>
        const TYPES = ${JSON.stringify(usedProjectTypes)};
        const PERMISSION = "${permission}";
        const CITIES = ${JSON.stringify(cities)};
        const LABELS = ${JSON.stringify(labels)};
        let DATA = ${JSON.stringify(safeData)};
        let selectedIds = new Set(DATA.map(p => p.id));
        let filteredData = [...DATA];
        
        // 此处省略了你原始代码中剩下的 JavaScript 逻辑（如 render, applyFilters 等）
        // 请确保在生成的文件中这些逻辑与你的 App.tsx 逻辑保持一致
        
        function closeModal(id) {
             document.getElementById(id).classList.add('hidden');
             document.getElementById(id).classList.remove('flex');
        }
    </script>
</body>
</html>\`;
};
