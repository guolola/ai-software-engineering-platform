// Product copy for the original Flow slots; translations add no layout wrappers.
import { useTranslation } from 'react-i18next';
import { i18n } from '../../../shared/i18n';
const copy: Record<string, Record<string, string>> = {
  "Benefits": {
    "zh-CN": "实践优势",
    "en": "Benefits"
  },
  "How Flow Helps You": {
    "zh-CN": "让软件工程实践更清晰",
    "en": "A clearer engineering workflow"
  },
  "It&apos;s built to simplify your sales process and keep everything easy to manage.": {
    "zh-CN": "连接需求、模型、代码与文档，让每个阶段都有据可查。",
    "en": "Connect requirements, models, code and documents in one traceable workflow."
  },
  "Start building now": {
    "zh-CN": "开始创建项目",
    "en": "Create a project"
  },
  "Learn more": {
    "zh-CN": "查看使用指南",
    "en": "Read the guide"
  },
  "Take Control of Your Sales Pipeline": {
    "zh-CN": "从需求出发，完成工程交付",
    "en": "From requirements to delivery"
  },
  "Join Flow and get a complete overview of your users, sales, and performance - all from one powerful dashboard.": {
    "zh-CN": "在同一个项目中组织需求分析、UML 建模、代码原型与说明书。",
    "en": "Organize requirements, UML models, code prototypes and specifications in one project."
  },
  "Get started": {
    "zh-CN": "开始使用",
    "en": "Get started"
  },
  "FAQ": {
    "zh-CN": "常见问题",
    "en": "FAQ"
  },
  "Frequently asked questions": {
    "zh-CN": "开始实践前，你可能想了解",
    "en": "Frequently asked questions"
  },
  "Here are some quick answers to help you understand how Flow powers your product success.": {
    "zh-CN": "了解项目、模型生成、文档与账户权益的基本使用方式。",
    "en": "Learn how projects, model generation, documents and account credits work."
  },
  "Features": {
    "zh-CN": "核心功能",
    "en": "Features"
  },
  "Powerful Features, Simple to Use": {
    "zh-CN": "贯穿软件工程的实践工具",
    "en": "Tools for the engineering lifecycle"
  },
  "Everything you need to manage sales, track growth, and stay focused-without the clutter.": {
    "zh-CN": "从分析到交付，在同一项目中组织产物、查看状态并追踪变更。",
    "en": "Organize artifacts, inspect progress and trace changes from analysis to delivery."
  },
  "User are improved by": {
    "zh-CN": "示例任务完成进度",
    "en": "Example task progress"
  },
  "than last month and product reached to 2,432 new users": {
    "zh-CN": "示意数据；实际进度以项目任务为准",
    "en": "Illustrative data; actual progress appears in project tasks"
  },
  "Product reach": {
    "zh-CN": "产物概览",
    "en": "Artifact overview"
  },
  "See how many people discover and engage with your product visitors, views and conversion signals at a glance.": {
    "zh-CN": "集中查看需求、模型、代码与文档，了解各阶段的产物及生成状态。",
    "en": "Review requirements, models, code and documents with their generation status."
  },
  "Athlete": {
    "zh-CN": "需求",
    "en": "Requirements"
  },
  "Artists": {
    "zh-CN": "设计",
    "en": "Design"
  },
  "Professionals": {
    "zh-CN": "开发",
    "en": "Development"
  },
  "Student": {
    "zh-CN": "测试",
    "en": "Testing"
  },
  "Targeted Visibility": {
    "zh-CN": "项目成员与权限",
    "en": "Project roles and access"
  },
  "Show your product only to selected customers, segments or regions tiers for precise marketing.": {
    "zh-CN": "按项目组织成员与访问权限，让协作范围清楚可见。",
    "en": "Organize members and access within each project."
  },
  "Riley Smith": {
    "zh-CN": "需求分析示例",
    "en": "Requirements example"
  },
  "$2,000": {
    "zh-CN": "需求阶段",
    "en": "Requirements"
  },
  "Taylor Morgan": {
    "zh-CN": "模型生成示例",
    "en": "Model generation"
  },
  "$2,200": {
    "zh-CN": "模型阶段",
    "en": "Models"
  },
  "Alex Thomas": {
    "zh-CN": "设计推导示例",
    "en": "Design example"
  },
  "$1,500": {
    "zh-CN": "设计模型",
    "en": "Design model"
  },
  "Jamie Parker": {
    "zh-CN": "代码原型示例",
    "en": "Code example"
  },
  "$800": {
    "zh-CN": "原型预览",
    "en": "Prototype preview"
  },
  "Casey Reynolds": {
    "zh-CN": "文档生成示例",
    "en": "Document example"
  },
  "$750": {
    "zh-CN": "说明书",
    "en": "Specification"
  },
  "Jordan Lee": {
    "zh-CN": "测试追踪示例",
    "en": "Test tracing example"
  },
  "$3,250": {
    "zh-CN": "跟踪矩阵",
    "en": "Traceability matrix"
  },
  "Customer Payments": {
    "zh-CN": "任务与历史记录",
    "en": "Tasks and history"
  },
  "Track who paid, how much, and the payment status — one clear ledger for sales, refunds and reconciliations.": {
    "zh-CN": "查看生成任务、阶段状态与历史产物，沿着记录回到对应工作。",
    "en": "Inspect generation tasks, stage status and historical artifacts."
  },
  "Set monthly sales goal": {
    "zh-CN": "示例项目阶段目标",
    "en": "Example project milestone"
  },
  "Goals & Targets": {
    "zh-CN": "阶段目标与前置条件",
    "en": "Milestones and prerequisites"
  },
  "Set user or revenue targets for any timeframe and watch progress update in real time-with clear insights at every step.": {
    "zh-CN": "按阶段组织建模与生成任务，明确前置条件并查看执行进度。",
    "en": "Organize modeling and generation by stage, with prerequisites and progress visible."
  },
  "Product Reach": {
    "zh-CN": "项目产物",
    "en": "Project artifacts"
  },
  "New users": {
    "zh-CN": "需求规则",
    "en": "Requirements"
  },
  "User queries": {
    "zh-CN": "模型关系",
    "en": "Model relations"
  },
  "Regular Updates": {
    "zh-CN": "运行状态更新",
    "en": "Live run status"
  },
  "Get regular real-time alerts and notifications for orders, payments, and customer activity—so nothing slips through the cracks": {
    "zh-CN": "查看任务排队、运行、完成与失败状态，及时了解产物更新。",
    "en": "Follow queued, running, completed and failed tasks as artifacts change."
  },
  "Online store": {
    "zh-CN": "需求阶段",
    "en": "Requirements"
  },
  "$120k": {
    "zh-CN": "示例",
    "en": "Example"
  },
  "+12.6%": {
    "zh-CN": "进行中",
    "en": "In progress"
  },
  "Offline store": {
    "zh-CN": "设计阶段",
    "en": "Design"
  },
  "$20k": {
    "zh-CN": "示例",
    "en": "Example"
  },
  "-4.2%": {
    "zh-CN": "待更新",
    "en": "Needs update"
  },
  "Sales & Growth": {
    "zh-CN": "阶段与追踪",
    "en": "Stages and traceability"
  },
  "Monitor product performance across stores orders, revenue and average order value in one place.": {
    "zh-CN": "连接上游需求与下游设计，通过跟踪矩阵查看关联和变更影响。",
    "en": "Connect upstream requirements to downstream designs through traceability matrices."
  },
  "Details": {
    "zh-CN": "示例说明",
    "en": "Illustration"
  },
  "Trusted by 5,000+ growing businesses": {
    "zh-CN": "面向软件工程教学与实践",
    "en": "For software engineering education and practice"
  },
  "Supercharge Your Product&rsquo;s": {
    "zh-CN": "用 AI 连接软件工程",
    "en": "Connect engineering with AI"
  },
  "Track every key metric in one clean dashboard - no code, no setup, just real-time insights that help you grow smarter.": {
    "zh-CN": "从需求分析、UML 建模到代码和说明书，在一个项目中完成可追踪的实践流程。",
    "en": "Work from requirements and UML models to code and specifications in one traceable project."
  },
  "Welcome to dashboard": {
    "zh-CN": "项目工作区",
    "en": "Project workspace"
  },
  "Your product orders": {
    "zh-CN": "需求与任务",
    "en": "Requirements and tasks"
  },
  "Product&rsquo;s insight": {
    "zh-CN": "模型与追踪",
    "en": "Models and traceability"
  },
  "User payments": {
    "zh-CN": "项目设置",
    "en": "Project settings"
  },
  "Pricing": {
    "zh-CN": "账户权益",
    "en": "Credits"
  },
  "Pricing Details": {
    "zh-CN": "按需选择账户权益",
    "en": "Choose credits for your work"
  },
  "A comprehensive breakdown of our pricing plans to help you make the best choice.": {
    "zh-CN": "价格与积分读取当前可用套餐，完整信息以账户计费页面为准。",
    "en": "Prices and credits come from the current catalog. See account billing for full details."
  },
  "Flat": {
    "zh-CN": "按需",
    "en": "Flexible"
  },
  "20%": {
    "zh-CN": "购买",
    "en": "Purchase"
  },
  "off for first 250 user": {
    "zh-CN": "查看当前可用套餐",
    "en": "View current packages"
  },
  "Monthly": {
    "zh-CN": "价格",
    "en": "Price"
  },
  "Yearly": {
    "zh-CN": "积分",
    "en": "Credits"
  },
  "Trending": {
    "zh-CN": "推荐",
    "en": "Featured"
  },
  "Testimonials": {
    "zh-CN": "功能实践",
    "en": "Use cases"
  },
  "Trusted by People Who Sell Smarter": {
    "zh-CN": "围绕真实工程任务组织实践",
    "en": "Practice with real engineering tasks"
  },
  "Real stories from users who simplified their sales process and grew their revenue with Flow.": {
    "zh-CN": "以下为平台能力与流程示例，不是客户评价或效果承诺。",
    "en": "These are capability and workflow examples, not customer testimonials or performance claims."
  },
  "4.5": {
    "zh-CN": "5",
    "en": "5"
  },
  "Stars out of 5": {
    "zh-CN": "工程实践阶段",
    "en": "Engineering stages"
  },
  "View all testimonials": {
    "zh-CN": "查看完整使用指南",
    "en": "Read the complete guide"
  },
  "Trusted by startups, enterprises, and industry giants alike.": {
    "zh-CN": "覆盖需求、建模、设计、代码、测试与文档。",
    "en": "Cover requirements, modeling, design, code, testing and documentation."
  },
  "Workbench dashboard preview": {
    "zh-CN": "软件工程实践平台工作台看板预览",
    "en": "Engineering platform workbench dashboard preview"
  },
  "Flow helps you centralize your product, sales, and user data - all in one simple, real-time dashboard built for growing businesses.": {
    "zh-CN": "本站为个人技术分享网站，由几位长期从事软件工程学科教学的高校老师共同打造。作为软件工程领域前沿技术的探索空间，本站致力于传播软件工程知识，探索前沿理论与技术，期望以此培养行业技术人才，助力国家软件技术发展。如果您对本站有任何意见或建议，欢迎联系我们。",
    "en": "This personal technology-sharing website is jointly maintained by university teachers with long-term experience in software engineering education. It shares software engineering knowledge, explores emerging theories and technologies, and supports the development of future software professionals. We welcome your feedback and suggestions."
  },
  "Contact: Professor Hong": {
    "zh-CN": "联系人：洪老师",
    "en": "Contact: Professor Hong"
  },
  "Company": {
    "zh-CN": "平台",
    "en": "Platform"
  },
  "Blog": {
    "zh-CN": "使用指南",
    "en": "Guide"
  },
  "Help": {
    "zh-CN": "帮助",
    "en": "Help"
  },
  "Customer Support": {
    "zh-CN": "使用帮助",
    "en": "Product help"
  },
  "Delivery Details": {
    "zh-CN": "产物与导出",
    "en": "Artifacts and export"
  },
  "Terms & Conditions": {
    "zh-CN": "使用说明",
    "en": "Usage guide"
  },
  "Privacy Policy": {
    "zh-CN": "账户安全",
    "en": "Account security"
  },
  "Subscribe to newsletter": {
    "zh-CN": "注册并开始实践",
    "en": "Register to get started"
  },
  "Flow": {
    "zh-CN": "软件工程实践平台",
    "en": "Engineering Platform"
  },
  "All rights reserved | Built to empower product teams worldwide.": {
    "zh-CN": "保留所有权利 · 面向软件工程教学与实践",
    "en": "All rights reserved · Software engineering education and practice"
  },
  "Menu": {
    "zh-CN": "菜单",
    "en": "Menu"
  },
  "Login": {
    "zh-CN": "登录",
    "en": "Login"
  },
  "Try demo": {
    "zh-CN": "开始实践",
    "en": "Get started"
  },
  "Try Demo": {
    "zh-CN": "开始实践",
    "en": "Get started"
  },
  "Toggle theme": {
    "zh-CN": "切换明暗主题",
    "en": "Toggle theme"
  },
  "Close": {
    "zh-CN": "关闭",
    "en": "Close"
  },
  "Unified Sales Overview": {
    "zh-CN": "从需求建立共同上下文",
    "en": "Start with shared requirements"
  },
  "Monitor leads, purchases, and orders in real-time to stay updated on every key business metric. This ensures you have the latest insights to make informed decisions.": {
    "zh-CN": "输入系统需求，整理规则与业务范围，为建模和后续设计提供依据。",
    "en": "Enter system requirements and organize rules and scope as the basis for modeling and design."
  },
  "Automated Follow-Ups": {
    "zh-CN": "从模型推导设计产物",
    "en": "Derive design artifacts"
  },
  "Let smart reminders handle repetitive tasks, allowing you to concentrate on closing more deals rather than managing them. This way, you can maximise your productivity and achieve better results.": {
    "zh-CN": "查看用例、分析模型与设计模型，在项目中保留它们之间的关联。",
    "en": "Review use cases, analysis models and designs while retaining their relationships."
  },
  "Clean & Simple Workflow": {
    "zh-CN": "组织清晰的阶段流程",
    "en": "Organize the workflow"
  },
  "Move deals effortlessly through stages with our intuitive pipeline system designed for clarity and control. This system ensures that you always have a clear view of your progress.": {
    "zh-CN": "按需求、设计、代码与文档推进项目，查看生成状态和需要补充的前置条件。",
    "en": "Move through requirements, design, code and documents with progress and prerequisites visible."
  },
  "Instant Performance Insights": {
    "zh-CN": "追踪变更与历史",
    "en": "Trace changes and history"
  },
  "Get accurate reports and analytics that help you understand growth patterns and make confident decisions. These insights empower you to strategies effectively for future success.": {
    "zh-CN": "通过跟踪矩阵、任务记录和产物历史，理解上游变更影响并回看执行结果。",
    "en": "Use matrices, task records and artifact history to understand changes and review results."
  },
  "What is Flow?": {
    "zh-CN": "这是什么平台？",
    "en": "What is this platform?"
  },
  "Flow is a SaaS platform that helps you monitor and manage your product performance - including users, purchases, and engagement - from a single dashboard.": {
    "zh-CN": "这是面向软件工程教学与实践的项目工作区，支持需求分析、UML 建模、代码原型与说明书生成。",
    "en": "A project workspace for software engineering education and practice, including requirements, UML, code prototypes and specifications."
  },
  "How does Flow help my business?": {
    "zh-CN": "如何开始一个项目？",
    "en": "How do I start a project?"
  },
  "Flow helps your business by providing clear insights into user behavior, sales performance, and engagement metrics, enabling you to make data-driven decisions and optimize growth.": {
    "zh-CN": "注册并登录后创建项目，输入系统需求，再按工作区提示完成各阶段操作。",
    "en": "Register, sign in, create a project and enter its requirements, then follow the workspace stages."
  },
  "Can I track multiple products at once?": {
    "zh-CN": "可以管理多个项目吗？",
    "en": "Can I manage multiple projects?"
  },
  "Yes, Flow allows you to track multiple products simultaneously, giving you a unified view of performance across all your products.": {
    "zh-CN": "可以。项目列表提供独立项目入口，项目内组织成员、模型、文档与历史记录。",
    "en": "Yes. Each project has its own members, models, documents and history."
  },
  "Do I need technical knowledge to use it?": {
    "zh-CN": "需要哪些前置知识？",
    "en": "What background do I need?"
  },
  "No, Flow is designed to be user-friendly and intuitive, so you can easily use it without any technical expertise.": {
    "zh-CN": "建议了解基本的软件工程与 UML 概念；使用指南会说明入口、前置条件和操作步骤。",
    "en": "Basic software engineering and UML knowledge helps. The guide explains entry points, prerequisites and steps."
  },
  "Is my data safe with Flow?": {
    "zh-CN": "如何管理项目访问？",
    "en": "How is project access managed?"
  },
  "Yes, your data is secure with Flow. We use industry-standard security practices to ensure your information is protected and handled safely.": {
    "zh-CN": "通过项目成员与权限管理访问范围，账户安全设置提供相应认证功能。",
    "en": "Manage access through project membership and permissions, with authentication controls in account security."
  },
  "Does Flow offer a free trial?": {
    "zh-CN": "如何查看价格与可用权益？",
    "en": "Where can I check prices and credits?"
  },
  "Yes, Flow offers a free trial so you can explore all core features and see how it fits your business before committing to a paid plan.": {
    "zh-CN": "首页展示当前套餐信息，登录后的账户计费页面提供完整权益、订单和支付信息。",
    "en": "The homepage shows current packages; account billing provides full credit, order and payment details."
  },
  "Essential Plan": {
    "zh-CN": "当前套餐",
    "en": "Current package"
  },
  "Perfect for solo founders and small teams": {
    "zh-CN": "按实际任务选择权益",
    "en": "Choose credits for your tasks"
  },
  "/month": {
    "zh-CN": "元 / 次购买",
    "en": "CNY / purchase"
  },
  "Basic Access": {
    "zh-CN": "查看账户权益",
    "en": "View credits"
  },
  "1 user seat": {
    "zh-CN": "需求分析",
    "en": "Requirements analysis"
  },
  "Real-time product analytics": {
    "zh-CN": "UML 建模",
    "en": "UML modeling"
  },
  "Up to 1K tracked users": {
    "zh-CN": "代码原型",
    "en": "Code prototypes"
  },
  "Basic revenue insights": {
    "zh-CN": "任务记录",
    "en": "Task history"
  },
  "Email support": {
    "zh-CN": "说明书生成",
    "en": "Specifications"
  },
  "Advanced Plan": {
    "zh-CN": "当前套餐",
    "en": "Current package"
  },
  "Build for small businesses.": {
    "zh-CN": "支持项目实践流程",
    "en": "Supports project workflows"
  },
  "Premium Access": {
    "zh-CN": "查看账户权益",
    "en": "View credits"
  },
  "Up to 10 user seats": {
    "zh-CN": "项目成员管理",
    "en": "Project membership"
  },
  "Advanced sales & engagement reports": {
    "zh-CN": "模型关联追踪",
    "en": "Model traceability"
  },
  "Up to 10K tracked users": {
    "zh-CN": "设计产物",
    "en": "Design artifacts"
  },
  "Smart growth insights": {
    "zh-CN": "历史记录",
    "en": "History"
  },
  "API & integrations": {
    "zh-CN": "产物导出",
    "en": "Artifact export"
  },
  "Team collaboration tools": {
    "zh-CN": "项目协作",
    "en": "Project collaboration"
  },
  "Secure data infrastructure": {
    "zh-CN": "账户设置",
    "en": "Account settings"
  },
  "Pro Plan": {
    "zh-CN": "当前套餐",
    "en": "Current package"
  },
  "Designed for growing teams and business.": {
    "zh-CN": "按需补充生成权益",
    "en": "Add credits when needed"
  },
  "Elite Access": {
    "zh-CN": "查看账户权益",
    "en": "View credits"
  },
  "Up to 25 user seats": {
    "zh-CN": "生成任务记录",
    "en": "Generation task history"
  },
  "Advanced automation workflows": {
    "zh-CN": "阶段状态追踪",
    "en": "Stage status"
  },
  "Up to 50K tracked users": {
    "zh-CN": "代码与原型",
    "en": "Code and prototypes"
  },
  "Predictive growth insights": {
    "zh-CN": "跟踪矩阵",
    "en": "Traceability matrix"
  },
  "Priority email & chat support": {
    "zh-CN": "文档编辑与导出",
    "en": "Document editing and export"
  },
  "Emily Watson": {
    "zh-CN": "需求分析",
    "en": "Requirements"
  },
  "Finally, a dashboard that shows": {
    "zh-CN": "从系统需求开始，整理",
    "en": "Start with system requirements and organize"
  },
  "everything that matters-users, orders, and revenue": {
    "zh-CN": "规则、参与者与核心业务",
    "en": "rules, actors and core business behavior"
  },
  "all in one clean view. It helps us make informed decisions much faster.": {
    "zh-CN": "，为模型与设计提供共同依据。",
    "en": " as a shared basis for modeling and design."
  },
  "Alex Rivera": {
    "zh-CN": "UML 建模",
    "en": "UML modeling"
  },
  "The interface is incredibly intuitive and the tools are very practical. We&apos;ve": {
    "zh-CN": "按业务语义查看",
    "en": "Inspect business semantics through"
  },
  "cut our deal cycle time almost in half": {
    "zh-CN": "用例、类图与活动模型",
    "en": "use cases, classes and activities"
  },
  "since making the switch. Adoption across the team was effortless.": {
    "zh-CN": "，并在工作区检查元素与关系。",
    "en": " and review elements and relationships in the workspace."
  },
  "Marcus Johnson": {
    "zh-CN": "设计推导",
    "en": "Design"
  },
  "The seamless integrations streamlined my daily workflow significantly. I can manage emails, track clients, and schedule follow-ups": {
    "zh-CN": "沿着需求与用例查看设计产物，",
    "en": "Follow requirements and use cases into design artifacts,"
  },
  "without ever leaving the platform": {
    "zh-CN": "保留上下游关联",
    "en": " retaining upstream and downstream links"
  },
  "Sarah Chen": {
    "zh-CN": "代码原型",
    "en": "Code prototypes"
  },
  "From onboarding to daily usage, everything feels well thought out. The components are": {
    "zh-CN": "查看生成文件、编辑代码并运行",
    "en": "Review generated files, edit code and run"
  },
  "polished, consistent, and production-ready": {
    "zh-CN": "原型预览",
    "en": "prototype previews"
  },
  ". Shipping new features is noticeably faster.": {
    "zh-CN": "，检查界面与业务实现。",
    "en": " to inspect the interface and behavior."
  },
  "Ncdai": {
    "zh-CN": "测试追踪",
    "en": "Test tracing"
  },
  "Clean design and sensible defaults make a huge difference. The": {
    "zh-CN": "通过测试模型与",
    "en": "Use test models and"
  },
  "documentation is clear and easy to follow": {
    "zh-CN": "跟踪矩阵检查关联",
    "en": "traceability matrices"
  },
  ", which saved me hours during setup.": {
    "zh-CN": "，定位需求与实现之间的覆盖关系。",
    "en": " to inspect coverage between requirements and implementation."
  },
  "Lisa Thompson": {
    "zh-CN": "说明书交付",
    "en": "Specifications"
  },
  "I&apos;ve used many UI kits, but this one strikes the perfect balance. The": {
    "zh-CN": "组织项目产物并生成",
    "en": "Organize project artifacts and generate"
  },
  "customization options are incredibly flexible": {
    "zh-CN": "可编辑的工程说明书",
    "en": "editable engineering specifications"
  },
  "without sacrificing design quality.": {
    "zh-CN": "，支持文档检查与导出。",
    "en": " for review and export."
  },
  "Amazon": {
    "zh-CN": "需求分析",
    "en": "Requirements"
  },
  "Deloitte": {
    "zh-CN": "UML 建模",
    "en": "UML"
  },
  "Evernote": {
    "zh-CN": "系统设计",
    "en": "Design"
  },
  "Fedex": {
    "zh-CN": "代码原型",
    "en": "Code"
  },
  "Hubspot": {
    "zh-CN": "软件测试",
    "en": "Testing"
  },
  "Microsoft": {
    "zh-CN": "文档交付",
    "en": "Documents"
  },
  "Walmart": {
    "zh-CN": "项目协作",
    "en": "Projects"
  },
  "Analytics & Insights": {
    "zh-CN": "分析与建模",
    "en": "Analysis and modeling"
  },
  "Unified Dashboard": {
    "zh-CN": "项目工作区",
    "en": "Project workspace"
  },
  "Get every key business metric in one place.": {
    "zh-CN": "集中组织项目中的工程产物。",
    "en": "Organize engineering artifacts in one workspace."
  },
  "Competitor Tracking": {
    "zh-CN": "需求分析",
    "en": "Requirements"
  },
  "Benchmark performance and market trends.": {
    "zh-CN": "梳理规则与业务边界。",
    "en": "Review rules and business boundaries."
  },
  "Sales Analytics": {
    "zh-CN": "模型追踪",
    "en": "Model tracing"
  },
  "Track revenue growth, conversions & profitability.": {
    "zh-CN": "查看需求、设计与代码关联。",
    "en": "Inspect requirement, design and code relationships."
  },
  "Productivity & Optimization": {
    "zh-CN": "实践与交付",
    "en": "Practice and delivery"
  },
  "Report & Export": {
    "zh-CN": "说明书与导出",
    "en": "Specifications and export"
  },
  "Share insights quickly with automated reporting.": {
    "zh-CN": "组织项目产物并导出文档。",
    "en": "Organize artifacts and export documents."
  },
  "Workflow Scheduling": {
    "zh-CN": "生成任务",
    "en": "Generation tasks"
  },
  "Plan content & operational tasks seamlessly.": {
    "zh-CN": "查看阶段进度与历史记录。",
    "en": "Inspect stage progress and history."
  },
  "User Management": {
    "zh-CN": "成员管理",
    "en": "Membership"
  },
  "Manage roles and access with complete control.": {
    "zh-CN": "管理项目成员和访问权限。",
    "en": "Manage members and project access."
  },
  "Guide": {
    "zh-CN": "使用指南",
    "en": "Guide"
  },
  "Growth": {
    "zh-CN": "需求",
    "en": "Requirements"
  },
  "Revenue": {
    "zh-CN": "模型",
    "en": "Models"
  },
  "Sales": {
    "zh-CN": "交付",
    "en": "Delivery"
  },
  "Your email address": {
    "zh-CN": "你的邮箱地址",
    "en": "Your email address"
  },
  "Total visitors": {
    "zh-CN": "示例项目概览",
    "en": "Example project overview"
  },
  "Total sales": {
    "zh-CN": "示例产物跟踪",
    "en": "Example artifact tracking"
  },
  "23.02K": {
    "zh-CN": "需求 → 模型",
    "en": "Requirements → UML"
  },
  "$2,150.00": {
    "zh-CN": "模型 → 代码",
    "en": "UML → Code"
  },
  "Desktop": {
    "zh-CN": "需求",
    "en": "Requirements"
  },
  "Tablet": {
    "zh-CN": "设计",
    "en": "Design"
  },
  "Mobile": {
    "zh-CN": "测试",
    "en": "Testing"
  },
  "Headset 22R": {
    "zh-CN": "文档任务示例",
    "en": "Example document task"
  },
  "Dell Vision 7": {
    "zh-CN": "可行性任务示例",
    "en": "Example feasibility task"
  },
  "Playstation 5": {
    "zh-CN": "测试任务示例",
    "en": "Example test task"
  },
  "Online Store": {
    "zh-CN": "需求阶段示例",
    "en": "Example requirements"
  },
  "Offline Store": {
    "zh-CN": "设计阶段示例",
    "en": "Example design"
  },
  "Credits": {
    "zh-CN": " 次权益",
    "en": " credits"
  },
  "功能说明 / Workflow example": {
    "zh-CN": "功能说明 · 非客户评价",
    "en": "Workflow example · not a review"
  },
  "$2,350": {
    "zh-CN": "代码阶段",
    "en": "Code"
  }
};
export function flowText(text: string) {
  const key = text.replace(/\s+/g, ' ').trim();
  const sourceKey = Object.keys(copy).find(value => value.replace(/&apos;/g, "'").replace(/&rsquo;/g, '’').replace(/&amp;/g, '&') === key) ?? key;
  return copy[sourceKey]?.[i18n.resolvedLanguage === 'en' ? 'en' : 'zh-CN'] ?? text;
}
export function FlowCopy({ text }: { text: string }) {
  useTranslation();
  return <>{flowText(text)}</>;
}
