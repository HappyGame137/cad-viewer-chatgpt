export const messages={
  zh:{
    title:'CAD Viewer · 三维查看与测量',open:'打开文件',demo:'通用演示',view:'显示',parts:'全部零件',explode:'拆分',section:'剖切',fit:'适合窗口',measure:'两点测量',snap:'顶点吸附',clear:'清除测量',units:'显示单位',stlUnits:'STL 原始单位',
    partAria:'显示零件',explodeAria:'装配拆分程度',sectionAria:'剖切位置',stageAria:'三维模型：拖动旋转，滚轮缩放；测量模式下点击两个点。',stageDescription:'三维模型视图，支持旋转、缩放、零件选择和两点尺寸测量。',detailsAria:'模型与测量说明',sectionFilled:'剖切按显示网格补面，保留真实孔洞。',sectionOpen:'部分截线不闭合，相关零件未补面；请检查原始网格。',
    chooseFile:'选择 STEP / STL 文件',loading:'正在读取模型…',counts:'零件：{parts} · 三角面：{triangles}',assemblyBounds:'总装外形 X / Y / Z：{size} {unit}',partBounds:'零件外形 X / Y / Z：{size} {unit}',
    gestures:'拖动旋转 · 滚轮缩放 · 右键拖动平移',measureOff:'开启“两点测量”后，在模型上选择两个点。',measureFirst:'选择第一个测量点。',measureSecond:'点 A：{point} {unit}；选择第二个点。',measureResult:'距离 ≈ {distance} {unit}　|　ΔX {x}　ΔY {y}　ΔZ {z}',
    defaultNote:'STEP 按毫米转换；STL 无内置单位。测量基于显示网格，适合结构检查。',stepNote:'STEP 显示网格偏差参数 {tolerance} mm；网格测量为近似值，不能替代精确几何或加工检验。',stlNote:'STL 原始单位：{unit}（由用户指定）；测量基于文件三角网格。',demoNote:'通用装配演示；点到点测量基于显示网格。',
    noParts:'模型没有可显示的零件。',readFailed:'无法读取模型。',fileTooLarge:'文件超过 30 MB。',noFileApi:'当前客户端未提供文件读取接口，请使用“打开文件”。',noFileContent:'文件内容不可用，请使用“打开文件”。',unknownError:'无法完成操作：{detail}',
    finitePoints:'需要两个以毫米表示的有限 XYZ 坐标。',badMesh:'网格为空或格式错误。',badCoordinates:'坐标无效或过大。',badIndices:'网格包含无效的顶点索引。',meshLimit:'模型超过 100 万三角面的预览上限，请降低显示精度。',noGeometry:'未找到可显示的实体或三角面。',meshSizeLimit:'转换后的显示网格超过 24 MB，请降低显示精度。',badUnits:'STL 原始单位必须为 mm、cm、m 或 in。',stlLimit:'STL 超过 100 万三角面的上限。',badStl:'文件不是有效的 ASCII 或二进制 STL。',incompleteStl:'ASCII STL 的三角面数据不完整。',emptyFile:'请选择非空且小于 30 MB 的 CAD 文件。',fileTypes:'支持 STEP（.step/.stp）和 STL（.stl）文件。',badTolerance:'显示网格偏差参数必须介于 0.01 与 2 mm 之间。',conversionTimeout:'STEP 转换超过 45 秒，请使用较小的装配或降低显示精度。',converterExit:'STEP 转换器已退出（{code}）。',absolutePath:'请提供 CAD 文件的绝对本地路径。',localPath:'不支持网络或设备路径，请选择本地磁盘文件。',outsideRoots:'文件位于允许目录之外，请通过 CAD_VIEWER_ALLOWED_ROOTS 添加其目录。',regularFile:'CAD 文件必须为小于 30 MB 的普通文件。',badBase64:'文件的 Base64 数据格式错误。',badStep:'无法转换 STEP 文件，请检查文件内容是否完整。'
  },
  en:{
    title:'CAD Viewer · View & Measure',open:'Open file',demo:'Demo',view:'View',parts:'All parts',explode:'Explode',section:'Section',fit:'Fit',measure:'Measure',snap:'Snap vertices',clear:'Clear',units:'Units',stlUnits:'STL source unit',
    partAria:'Show parts',explodeAria:'Assembly explode amount',sectionAria:'Section position',stageAria:'3D model: drag to rotate, scroll to zoom; click two points in measurement mode.',stageDescription:'3D model view with rotation, zoom, part selection and point-to-point measurement.',detailsAria:'Model and measurement details',sectionFilled:'Cut faces follow the display mesh; actual holes are preserved.',sectionOpen:'Some cut contours are open; affected parts are not capped. Check the source mesh.',
    chooseFile:'Choose a STEP / STL file',loading:'Loading model…',counts:'Parts: {parts} · Triangles: {triangles}',assemblyBounds:'Assembly X / Y / Z: {size} {unit}',partBounds:'Part X / Y / Z: {size} {unit}',
    gestures:'Drag: rotate · Wheel: zoom · Right drag: pan',measureOff:'Turn on Measure and choose two points on the model.',measureFirst:'Choose the first measurement point.',measureSecond:'Point A: {point} {unit}; choose the second point.',measureResult:'Distance ≈ {distance} {unit} | ΔX {x}　ΔY {y}　ΔZ {z}',
    defaultNote:'STEP is converted to mm; STL has no built-in unit. Measurements use the display mesh.',stepNote:'STEP mesh tolerance: {tolerance} mm. Mesh measurements are approximate; use exact geometry or inspection for precision.',stlNote:'STL source unit: {unit} (user selected). Measurements use the file’s triangle mesh.',demoNote:'Generic assembly demo; point-to-point measurements use the display mesh.',
    noParts:'The model has no displayable parts.',readFailed:'Unable to read the model.',fileTooLarge:'The file exceeds 30 MB.',noFileApi:'This client has no file-reading interface. Use Open file.',noFileContent:'File content is unavailable. Use Open file.',unknownError:'Unable to complete the operation: {detail}',
    finitePoints:'Expected two finite XYZ points in millimetres.',badMesh:'Empty or malformed mesh.',badCoordinates:'Invalid or excessively large coordinates.',badIndices:'Mesh contains invalid indices.',meshLimit:'Model exceeds the one million triangle preview limit. Use a coarser display tolerance.',noGeometry:'No displayable solids or triangles were found.',meshSizeLimit:'Converted display mesh exceeds the 24 MB limit. Use a coarser tolerance.',badUnits:'STL source units must be mm, cm, m, or in.',stlLimit:'STL exceeds the one million triangle limit.',badStl:'Not a valid ASCII or binary STL.',incompleteStl:'Incomplete ASCII STL triangles.',emptyFile:'Select a nonempty CAD file smaller than 30 MB.',fileTypes:'Supported file types: STEP (.step/.stp) and STL (.stl).',badTolerance:'Display tolerance must be between 0.01 and 2 mm.',conversionTimeout:'STEP conversion exceeded 45 seconds. Try a smaller assembly or coarser tolerance.',converterExit:'STEP converter exited ({code}).',absolutePath:'Provide an absolute local CAD file path.',localPath:'Network and device paths are not supported. Choose a local drive path.',outsideRoots:'File is outside permitted roots. Configure CAD_VIEWER_ALLOWED_ROOTS to include its folder.',regularFile:'CAD file must be a regular file smaller than 30 MB.',badBase64:'Malformed base64 file data.',badStep:'Unable to convert the STEP file. Check that the file is complete.'
  }
};

export function resolveLanguage(saved,browserLanguage='en'){
  return saved==='zh'||saved==='en'?saved:/^zh(?:-|$)/i.test(browserLanguage)?'zh':'en';
}
export function translate(language,key,params={}){
  const template=messages[language]?.[key]??messages.en[key];
  if(template===undefined)throw new Error(`Missing translation: ${key}`);
  return template.replace(/\{(\w+)\}/g,(_,name)=>String(params[name]??`{${name}}`));
}
export class ViewerError extends Error{
  constructor(key,params={}){super(translate('en',key,params));this.key=key;this.params=params;}
}
const serverErrors=new Map(Object.entries(messages.en).map(([key,value])=>[value,key]));
serverErrors.set('Supported file types: STEP and STL.','fileTypes');
serverErrors.set('STL exceeds the triangle limit.','stlLimit');
serverErrors.set('File too large','fileTooLarge');
export function errorText(language,error){
  if(!error)return '';
  if(error instanceof ViewerError)return translate(language,error.key,error.params);
  const detail=error.message||String(error),key=serverErrors.get(detail);
  if(key)return translate(language,key);
  const exit=detail.match(/^STEP converter exited \((\d+)\)\.$/);
  if(exit)return translate(language,'converterExit',{code:exit[1]});
  if(/^STEP import failed/.test(detail))return translate(language,'badStep');
  return translate(language,'unknownError',{detail});
}
