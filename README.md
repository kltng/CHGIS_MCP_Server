# CHGIS MCP Server

CHGIS (China Historical Geographic Information System) 时空地名查询API的MCP (Model Context Protocol) 服务器wrapper。

## 功能特性

这个MCP服务器提供了对CHGIS历史地名数据库的访问功能，包括：

### 工具列表

1. **`search_place_by_id`** - 根据唯一ID精准查询地名
   - 输入：地名ID（格式：hvd_数字）
   - 输出：详细的地名信息，包括历史名称、行政区划、时间跨度、地理位置等

2. **`search_places`** - 分面搜索地名
   - 支持多参数组合搜索：
     - `name`: 地名（中文、拼音等）
     - `year`: 历史年份（-222 至 1911）
     - `feature_type`: 行政等级类型（州、县、府等）
     - `parent`: 上级地名
     - `source`: 数据来源（CHGIS、RAS）
   - 支持多种输出格式（JSON、XML、HTML）

3. **`get_place_historical_context`** - 获取地名历史沿革
   - 输入：地名ID
   - 输出：详细的历史隶属关系、下辖单位、时间变迁等信息

## 安装和使用

### 前置要求

- Node.js >= 18.0.0
- npm 或 yarn

### 安装步骤

1. 克隆或下载此项目
2. 安装依赖：
   ```bash
   npm install
   ```

### 在Claude Code中配置

在Claude Code的配置文件中添加此MCP服务器：

```json
{
  "mcpServers": {
    "chgis": {
      "command": "node",
      "args": ["/path/to/your/chgis-mcp-server/src/index.js"]
    }
}
}
```

如使用 Docker（stdio）：

```json
{
  "mcpServers": {
    "chgis": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "chgis-mcp:dev"]
    }
  }
}
```

使用 Streamable HTTP（需要支持 HTTP 传输的客户端）：

- 端点：`POST http://localhost:3000/mcp`
- 示例请求（列出工具）：

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }' | jq .
```

注意：根据 MCP Streamable HTTP 规范，客户端应声明同时接受 JSON 与事件流响应头。请在请求中包含：

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }' | jq .
```

- 示例请求（调用工具）：

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "search_place_by_id",
      "arguments": { "id": "hvd_32180", "format": "json" }
    }
  }' | jq .
```

带 Accept 头的示例：

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "search_place_by_id",
      "arguments": { "id": "hvd_32180", "format": "json" }
    }
  }' | jq .
```

### 启动服务器

```bash
npm start
```

### 使用 Docker 运行

构建镜像并通过 Docker 运行。默认使用 Streamable HTTP；如需 stdio，可传入参数。

```bash
# 构建镜像
docker build -t chgis-mcp:dev .

# 选项A：Streamable HTTP（默认，容器作为HTTP服务）
docker run --rm -p 3000:3000 chgis-mcp:dev

# 选项B：stdio（客户端作为父进程启动服务）
docker run --rm -i chgis-mcp:dev stdio

# 可选：使用 docker-compose（开发时方便）
docker compose up --build
```

在 Claude Code 中配置为调用容器命令（stdio 示例）：

```json
{
  "mcpServers": {
    "chgis": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "chgis-mcp:dev", "stdio"]
    }
  }
}
```

如使用 HTTP 模式，请配置客户端使用 Streamable HTTP 传输（依客户端而定）。服务端端点：

```
HTTP 端点:    POST http://localhost:3000/mcp
健康检查:     GET  http://localhost:3000/healthz
```

注意：Streamable HTTP 适合容器/远程部署；stdio 适合本地由客户端直接启动进程的场景。

## 使用示例

### 1. 根据ID查询地名

```javascript
// 查询婺州（hvd_32180）的详细信息
search_place_by_id({
  id: "hvd_32180",
  format: "json"
})
```

### 2. 分面搜索地名

```javascript
// 搜索名称包含"晋阳"的地名
search_places({
  name: "晋阳",
  format: "json"
})

// 搜索1820年的县级行政单位
search_places({
  year: 1820,
  feature_type: "xian",
  format: "json"
})

// 多参数搜索
search_places({
  name: "庆",
  feature_type: "xian",
  year: 1420,
  parent: "Chuzhou",
  format: "json"
})
```

### 3. 获取历史沿革信息

```javascript
// 获取婺州的历史沿革
get_place_historical_context({
  id: "hvd_32180"
})
```

## 数据结构说明

### 地名详细信息包含

- **基本信息**：系统ID、URI、数据来源、许可证
- **拼写信息**：多种文字的历史名称（繁体中文、简体中文、拼音等）
- **行政类型**：行政等级名称和英文翻译
- **时间跨度**：起始年份、结束年份
- **地理位置**：经纬度坐标、现今位置

### 搜索结果包含

- **查询统计**：显示结果数、总结果数
- **地名列表**：每个地名的基本信息和详情链接

### 历史沿革包含

- **历史名称**：不同时期的历史名称
- **时间跨度**：存在的时间范围
- **隶属关系**：不同历史时期的上级单位
- **下辖单位**：管辖的下级行政单位及其时间范围

## API限制和注意事项

1. **网络依赖**：此MCP服务器需要访问 `https://chgis.hudci.org/tgaz/` 的CHGIS API
2. **时间范围**：数据库中的历史年份范围为 -222 至 1911
3. **ID格式**：地名ID格式必须为 `hvd_` 开头加数字（如 `hvd_32180`）
4. **字符编码**：支持UTF-8编码的中文字符，无需URL编码
5. **数据来源**：主要来自CHGIS项目和RAS数据

## 错误处理

- **无效ID格式**：会提示正确的ID格式
- **未找到记录**：当搜索无结果时会返回相应提示
- **网络错误**：会显示网络连接相关的错误信息
- **参数验证**：会验证输入参数的有效性

## 数据来源

- [CHGIS - China Historical Geographic Information System](http://yugong.fudan.edu.cn/)
- [Temporal Gazetteer API](http://tgaz.fudan.edu.cn/tgaz/indexAPI.html)
- Harvard University & Fudan University
