import { Alert, Box, Button, Link, Paper, Stack, Typography } from "@mui/material";

export default function PolicyPage({ kind }: { kind: "privacy" | "terms" }) {
    return <Paper component="article" variant="outlined" sx={{ p: { xs: 2, sm: 4 }, overflowWrap: "anywhere" }}>
        <Stack spacing={2} sx={{
            "& p": { lineHeight: 1.9 },
            "& h2": { pt: 2 },
            "& a": {
                font: "inherit",
                color: "primary.main",
                fontWeight: 600,
                mx: "0.2em",
                borderRadius: "2px",
                textDecoration: "none",
                textUnderlineOffset: "0.25em",
                textDecorationThickness: "1px",
                "&:hover, &:focus-visible": {
                    bgcolor: "action.hover",
                    textDecoration: "underline",
                },
            },
        }}>
            <Typography variant="h4" component="h1">{kind === "privacy" ? "隐私政策" : "使用条款"}</Typography>
            {kind === "privacy" ? <>
                <Typography>本隐私政策说明 Aldaris 在提供团队工单协作服务时如何收集、使用、保存和共享信息，以及您可以如何管理相关数据。请在登录、提交内容或管理账户前阅读本政策，并同时阅读<Link href="/#/terms">使用条款</Link>。</Typography>
                <Alert severity="warning">工单、评论和图片对同一站点内的已登录成员可见。图片可能因容量不足而自动清理；删除账户不会一并删除历史协作内容。请勿提交密码、访问凭据或不适合向全体成员公开的信息。</Alert>

                <Typography component="h2" variant="h6">一、适用范围与管理责任</Typography>
                <Typography>本政策适用于当前 Aldaris 站点的账户、工单、评论、图片及管理功能。"本站"或"本服务"指当前团队使用的独立部署；"管理员"指负责团队账户和日常使用管理的人员；"运营者"指负责该部署及服务资源的主体。具体运营主体、管理人员和联系方式，请通过向您提供账户的团队确认。</Typography>
                <Typography>本政策不替代团队的保密要求，也不适用于外部链接指向的其他网站。软件开发者不会仅因提供 Aldaris 软件而自动取得当前站点的业务数据访问权。</Typography>

                <Typography component="h2" variant="h6">二、收集的信息及其来源</Typography>
                <Typography>账户信息：管理员创建和维护账户时提供的姓名或昵称、用户名、角色，以及账户创建、修改和删除相关记录。本站保存用于校验密码的数据，不以明文保存账户密码。管理员设置初始密码或重置密码时会接触其输入的密码，请妥善管理交接和后续使用。</Typography>
                <Typography>协作内容：您或其他成员提交的工单标题、描述、评论、图片、提及的成员、指派关系、状态、优先级、变更原因和提交时间。内容可能包含提交者主动写入的个人资料、截图和第三方信息，提交前应确认共享的必要性及授权。</Typography>
                <Typography>登录与操作信息：登录状态、登录尝试时间、工单变更、评论编辑或删除及账户管理记录，用于维持登录、追踪协作过程和管理账户。</Typography>
                <Typography>网络与故障信息：本站及服务商会处理 IP 地址等网络信息、登录尝试记录和错误记录，用于保障访问安全和排查故障。</Typography>
                <Typography>当前账户流程不要求电子邮箱、电话号码、身份证件或付款信息，应用也未设置广告画像、跨站行为分析或出售个人信息的业务功能。请勿将与协作无关的敏感资料写入文本或图片。</Typography>

                <Typography component="h2" variant="h6">三、信息的使用目的</Typography>
                <Typography>本站使用上述信息完成身份验证、检查权限、展示和处理工单、关联评论与成员、记录状态及指派变化、维护账户，并防范密码暴力尝试、未经授权的操作和重复提交。浏览器中的偏好与草稿用于保持界面设置和减少文字输入丢失。</Typography>
                <Typography>提及或指派成员用于表达协作关系，不会使内容仅对该成员可见。当前服务不发送站内通知或外部消息，请通过团队约定的渠道通知相关人员。</Typography>

                <Typography component="h2" variant="h6">四、可见范围与信息共享</Typography>
                <Typography>同一部署内的已登录成员可以查看工单、评论、图片和工单时间线，并通过成员搜索查看匹配账户的姓名或昵称和用户名。本站不提供按工单或指派对象划分的私密可见范围，请按向全体成员共享的标准提交内容。</Typography>
                <Typography>账户管理页面和操作记录仅供管理员访问。管理员可以维护账户、重置密码，并按权限编辑或删除评论。运营者可因运行和维护服务接触保存的数据。</Typography>
                <Typography>成员可能复制、截图或另行保存已看到的内容。本站无法通过退出登录、删除账户或清理图片收回他人已有的副本。未经授权，不得将团队资料转发给无关人员。</Typography>
                <Typography>运营者处理外部披露请求时，应核验依据和范围，仅在具有适用法律依据、必要授权或其他合法理由时提供必要信息。具体请求及处理情况请向运营者了解。</Typography>

                <Typography component="h2" variant="h6">五、浏览器存储、草稿与缓存</Typography>
                <Typography>本站会在您的浏览器中保存登录状态、账户资料、主题偏好和文字草稿，以便继续使用。文字草稿仅保存在您的设备上，不包含密码或未提交的图片。</Typography>
                <Typography>草稿是否保留受浏览器会话恢复和存储清理等行为影响。退出登录不等于清除全部草稿、主题偏好或缓存。共享设备使用完毕后，请退出登录并按需要清理本站浏览器数据；请勿依靠草稿备份重要内容。</Typography>
                <Typography>浏览器可能保留页面和图片副本，本站删除图片后，这些副本仍可能存在。清除设备上的站点数据不会删除本站保存的账户和协作记录。禁止浏览器保存数据可能影响登录或草稿功能。</Typography>

                <Typography component="h2" variant="h6">六、第三方服务与外部请求</Typography>
                <Typography>Cloudflare：提供本站的运行和数据保存服务，会处理访问请求及您提交的数据。详情见<Link href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="external noopener noreferrer nofollow">Cloudflare 隐私政策</Link>。</Typography>
                <Typography>Google Fonts：页面从该服务加载字体，浏览器会发送字体请求及建立连接所需的网络信息。字体请求不需要提交您的工单正文或账户密码。详情见<Link href="https://fonts.google.com/faq" target="_blank" rel="external noopener noreferrer nofollow">Google Fonts 常见问题</Link>和<Link href="https://policies.google.com/privacy" target="_blank" rel="external noopener noreferrer nofollow">Google 隐私政策</Link>。</Typography>
                <Typography>Have I Been Pwned：设置新密码时提供泄露风险检查，会接收由密码生成的部分校验信息及网络信息，不会收到完整密码。检查结果仅供参考，未出现风险提示不代表密码安全。详情见<Link href="https://haveibeenpwned.com/API/v3#PwnedPasswords" target="_blank" rel="external noopener noreferrer nofollow">密码泄露查询说明</Link>。</Typography>
                <Typography>外部服务的内容和政策可能变化，其不可用可能影响字体显示或密码辅助检查。列出这些服务用途不代表本站向每一家服务商发送全部业务内容；访问外部链接后的信息处理由相应提供方负责。</Typography>

                <Typography component="h2" variant="h6">七、保存位置与安全措施</Typography>
                <Typography>业务数据和图片由运营者配置的 Cloudflare 服务保存，浏览器数据保存在您使用的设备上。第三方网络和存储服务可能涉及您所在国家或地区以外的处理，本站不承诺仅在某一国家或地区保存。团队如有数据位置或跨境处理要求，应先向运营者核实后再提交相关内容。</Typography>
                <Typography>请妥善保管设备和账户，发现异常时及时联系管理员。任何网络服务均无法保证绝对安全。</Typography>

                <Typography component="h2" variant="h6">八、保存期限与自动清理</Typography>
                <Typography>账户、工单、评论和操作记录会按使用和维护需要保留，没有统一的自动删除期限。退出登录不会删除这些记录。其他记录的具体留存情况请向运营者了解。</Typography>
                <Typography>图片可能因容量不足而被自动删除，包括尚未完成的工单中的图片，删除前可能不会通知。请另行保存重要图片。</Typography>
                <Typography>管理员或运营者可能因维护、资源限制、服务重建或停止运营清理部分或全部数据。本站不承诺永久保存、定期备份或数据恢复；请通过团队认可的方式另行保留重要内容。基础设施日志及服务商副本的留存受相关配置和服务商政策影响，请向运营者核实。</Typography>

                <Typography component="h2" variant="h6">九、查阅、更正、删除与其他请求</Typography>
                <Typography>您可以登录查看账户和团队可见内容，在账户页面修改自己的密码，并按权限编辑或删除自己的评论。需要更正姓名或用户名、删除账户、申请与您有关的数据副本或处理访问问题时，请联系管理员。当前服务不提供自助账户注销或一键个人数据导出功能。</Typography>
                <Typography>删除账户后将无法继续登录，但工单、评论和历史记录仍可能保留您的姓名、用户名及其他信息。删除账户不会自动删除全部个人信息；如需处理相关内容，请联系管理员。</Typography>
                <Typography>删除评论后，相关操作记录仍可能保留。个人信息若出现在他人提交的内容或历史记录中，请说明具体内容和请求范围，由管理员核实处理。</Typography>
                <Typography>您也可以就信息使用提出异议、请求限制处理或咨询适用的数据权利。管理员可能需要通过既有团队渠道核实身份。请求的处理方式取决于适用法律、团队管理要求和必要留存依据；需要保留部分信息时，应说明原因，本政策不排除您依法享有的权利。</Typography>

                <Typography component="h2" variant="h6">十、未成年人及他人信息</Typography>
                <Typography>本站面向经团队授权的协作成员，不提供面向公众的自主注册。若成员为未成年人，应由团队确认其使用符合适用要求，并在需要时取得监护人同意。请勿提交与工作无关的未成年人资料；发现未经授权收集或共享的个人信息时，请联系管理员处理。</Typography>

                <Typography component="h2" variant="h6">十一、政策更新与联系</Typography>
                <Typography>数据处理方式或服务功能变化时，本政策应相应更新。重要变化应由运营者通过团队约定的渠道说明，并按适用要求取得必要授权。请结合本站公开政策及运营者说明了解实际处理方式。</Typography>
                <Typography>隐私、账户资料、数据副本、删除或安全问题，请通过取得账户时使用的团队渠道联系管理员；涉及基础设施或运营主体的问题，请要求转交运营者。仅提供定位问题所需的信息，请勿发送密码、完整登录凭据或无关个人资料。</Typography>
            </> : <>
                <Typography>Aldaris 采用 GNU Affero General Public License 第 3 版 (AGPL-3.0-only) 授权，仅适用第 3 版。您可以依照许可证获取、修改和再分发本软件。本使用条款不限制该许可证授予您的软件权利。请参阅<Link href="/#/license">开源许可</Link>及<Link href="https://github.com/DESMG/Aldaris" target="_blank" rel="external noopener noreferrer nofollow">源代码</Link>。</Typography>
                <Typography>本使用条款适用于当前 Aldaris 团队工单协作站点。请在使用账户和提交内容前完整阅读，并结合<Link href="/#/privacy">隐私政策</Link>了解信息处理方式。若无法接受本服务的共享范围或留存方式，请先联系管理员安排其他协作方式。</Typography>
                <Alert severity="warning">本站供单个团队内部协作，工单内容对同一部署内的已登录成员可见。本站不承诺持续可用、永久保存或恢复数据；容量不足时，尚未完成的工单图片也可能被自动清理。</Alert>

                <Typography component="h2" variant="h6">一、服务范围与条款适用</Typography>
                <Typography>Aldaris 提供工单创建、评论、图片提交、状态和优先级管理、成员指派及账户管理等功能。"本站"或"本服务"指当前独立部署，"您"指访问或使用本站的人员，"管理员"指团队账户和协作管理人员，"运营者"指负责该部署及服务资源的主体。</Typography>
                <Typography>账户由管理员创建和管理，您应在团队授权范围内使用。可用功能以当前页面和权限为准，团队授权不意味着您可以访问其他团队或部署。具体运营主体和联系渠道，请向提供账户的团队确认。</Typography>

                <Typography component="h2" variant="h6">二、账户与登录安全</Typography>
                <Typography>请使用分配给您本人的账户，提供准确且可供团队识别的资料，不冒用身份、不出借账户、不公开凭据。妥善交接初始或重置密码，避免与其他服务重复使用密码。发现泄露或异常操作时，应及时修改密码并联系管理员。</Typography>
                <Typography>在其他设备登录或账户资料发生变化后，您可能需要重新登录。</Typography>
                <Typography>多次登录失败后，您可能需要等待一段时间才能重试，具体以页面提示为准。同一网络的其他成员也可能受影响。请勿重复猜测密码或绕过限制。密码强度提示和泄露查询只是辅助措施，不能证明密码绝对安全。</Typography>
                <Typography>共享设备使用完毕后应退出登录，并按需要清理本站浏览器数据。草稿、缓存及他人已下载的内容不会因账户退出或失效而全部消失。</Typography>

                <Typography component="h2" variant="h6">三、团队共享与协作责任</Typography>
                <Typography>本站的工单、评论、图片和时间线对全体已登录成员可见，包括未被指派或提及的成员。请勿提交不适合在团队内共享的内容。</Typography>
                <Typography>请准确描述问题、状态和处理结果，不冒充其他成员作出承诺。状态、优先级、指派和评论用于记录协作，不自动保证交付时间、处理结果或内容真实性。</Typography>
                <Typography>当前服务不提供站内通知或外部消息下发。提及、指派或提交评论不意味着相关人员已收到提醒或阅读；需要及时响应的事项，应通过团队约定的沟通渠道另行确认。</Typography>

                <Typography component="h2" variant="h6">四、内容权利与必要授权</Typography>
                <Typography>您应确保有权提交文字、截图及其他内容，并具备在团队范围共享个人信息、商业资料和第三方作品的必要授权。上传不改变原内容的权利归属，也不自动授予其他成员向团队之外传播或另作商业使用的权利。</Typography>
                <Typography>为提供协作服务，您允许本站及必要的服务商保存、展示和处理您提交的内容。使用范围以服务功能和隐私政策为限。</Typography>
                <Typography>使用他人内容时，应遵守适用法律、权利人的授权及团队保密约定。引用外部材料时保留必要来源说明，未经授权不得复制、披露或转交团队资料。</Typography>

                <Typography component="h2" variant="h6">五、禁止的使用行为</Typography>
                <Typography>不得提交违法、侵权、诈骗、威胁、骚扰或恶意冒充内容，不得泄露他人隐私、密码、访问密钥及其他未经授权披露的资料。不得发送垃圾信息、传播恶意文件或诱导成员访问钓鱼页面。</Typography>
                <Typography>不得未经授权访问账户或数据、绕过权限和限流、伪造操作、利用漏洞攻击本站、干扰服务，或以批量请求和重复上传耗尽共享资源。安全测试应事先取得运营者明确授权，并遵守约定范围。</Typography>
                <Typography>发现漏洞、误公开信息或疑似违规内容时，请向管理员报告必要的定位信息，不要为证明问题扩大访问、下载无关数据或传播敏感内容。</Typography>

                <Typography component="h2" variant="h6">六、图片提交与内容检查</Typography>
                <Typography>请按上传页面提示选择图片，不得绕过上传限制。</Typography>
                <Typography>上传可能降低图片尺寸和画质，不会自动遮盖画面中的个人信息。请先裁剪或遮盖不应共享的信息，并确认上传后仍可辨认所需内容。</Typography>
                <Typography>上传不能替代原件归档，请另行保存重要原图。未提交图片不会随文字草稿一起保存。</Typography>

                <Typography component="h2" variant="h6">七、容量、留存与数据丢失</Typography>
                <Typography>图片可能因容量不足而被自动删除，包括尚未完成的工单中的图片，删除前可能不会通知，删除后不保证恢复。</Typography>
                <Typography>文字草稿和缓存可能因设备、浏览器或存储变化丢失，不能作为备份。请另行保留工作必需的重要内容，并遵守团队的数据保存和保密要求。</Typography>
                <Typography>本站不承诺永久保存账户、工单、评论、操作记录或图片，也不承诺备份、历史版本回退或恢复。维护、资源限制、故障、重建或停止运营可能导致部分或全部数据不可用或丢失。</Typography>

                <Typography component="h2" variant="h6">八、内容修改与停止使用</Typography>
                <Typography>评论作者或管理员可以按权限编辑和删除评论，相关行为会留下记录。需要更正其他内容或处理资料删除请求时，请联系管理员；页面未提供功能不表示可以擅自绕过权限修改数据。</Typography>
                <Typography>管理员可以管理账户，并处理违反团队管理要求的行为。删除账户不会自动删除工单、评论及历史记录，其中仍可能保留个人信息，具体范围见<Link href="/#/privacy">隐私政策</Link>。</Typography>
                <Typography>您可以停止使用并联系管理员处理账户。退出、停止使用或删除账户，不会收回其他成员保存的副本，也不免除此前使用产生的内容责任及依法应继续承担的保密义务。</Typography>

                <Typography component="h2" variant="h6">九、第三方服务与外部链接</Typography>
                <Typography>本站使用 Cloudflare 运行和存储服务、Google Fonts 字体，以及创建账户、修改或重置密码时的 Have I Been Pwned 密码辅助检查。第三方网络、资源限制、故障或政策变化可能影响访问、显示、提交及辅助检查。</Typography>
                <Typography>外部网站由其提供方负责。本站展示链接或成员引用来源，不表示运营者认可内容或保证其安全、准确、持续可用。向外部服务提交资料前，请自行确认其用途与政策。</Typography>

                <Typography component="h2" variant="h6">十、服务变更、中断与责任</Typography>
                <Typography>运营者可能因维护、升级、资源限制、安全问题或团队安排调整功能、限制访问、清理数据、暂停或终止服务。可提前安排的重大变更应通过团队渠道说明，突发故障和紧急处理可能无法提前通知。</Typography>
                <Typography>服务按当前可用状态提供，不承诺无故障、无中断、满足所有特定用途或保证成员内容准确。请勿将本站作为紧急事项的唯一通知渠道或重要资料的唯一保存位置。</Typography>
                <Typography>在适用法律允许的范围内，运营者不对超出其合理控制范围的网络故障、第三方中断，以及使用者未按共享和留存规则处理内容所导致的损失作出赔偿承诺。实际责任应结合过错、因果关系、适用法律和有效约定判断。本条款不排除依法不得排除的责任，也不剥夺您依法享有的权利。</Typography>

                <Typography component="h2" variant="h6">十一、争议与投诉</Typography>
                <Typography>发生账户、内容权利、隐私或协作争议时，请先向管理员说明事实、涉及内容和期望处理方式；涉及运营责任的事项应转交运营者。核实过程中请避免再次传播敏感资料。</Typography>
                <Typography>本条款不另行指定未经确认的适用法、法院或仲裁机构。争议应依据实际适用的法律和有效约定处理；部分条款无效或无法执行时，其余条款在法律允许的范围内继续适用。</Typography>

                <Typography component="h2" variant="h6">十二、条款更新与联系</Typography>
                <Typography>服务范围和使用规则变化时，本条款应相应更新。涉及共享范围、数据处理或重要权益的变化，运营者应通过团队渠道说明，并在需要时取得必要确认；不得仅以条款更新排除法定权利。</Typography>
                <Typography>如对条款、账户、内容权限或维护有疑问，请通过取得账户时使用的团队渠道联系管理员，必要时要求转交运营者。提供说明时请勿附带密码或完整登录凭据。</Typography>
            </>}
        </Stack>
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
            <Button href="/#/" variant="contained">我已知晓</Button>
        </Box>
    </Paper>;
}
